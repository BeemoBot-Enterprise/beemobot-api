# Bot Live Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 on-demand Discord slash commands (`/live`, `/predict`, `/debrief`) that scout LoL games, predict win probability, and analyze recent matches — all with deterministic algorithms (no LLM), no polling, no auto-DMs.

**Architecture:** Bot Python sends HTTP request to `beemobot-api` per command. API resolves the user's `discord_id → riot_puuid`, calls the Riot API (Spectator v5 + League v4 + Mastery v4 + Match v5), runs an in-process scoring/heuristic service, returns enriched JSON. Bot formats it into an ephemeral Discord embed. Reuses existing `Cache.memo` for Riot caching.

**Tech Stack:** AdonisJS 6 (TypeScript), Lucid ORM, Japa for tests (functional + unit), Riot API v4/v5, Data Dragon, discord.py 2.x with `app_commands`, `aiohttp` for the bot HTTP client.

**Spec reference:** `docs/superpowers/specs/2026-05-07-bot-live-companion-design.md`

**Implementation order rationale:**
1. Foundation (Spectator v5 method) — enables `/live` and `/predict`
2. `/debrief` — simplest (no Spectator dependency), great TDD warm-up on heuristics
3. `/predict` — introduces Spectator usage, lightest enrichment
4. `/live` — most complex, builds on the previous two
5. Polish (anti-flood, help)

Each command is independently shippable: ship `/debrief` to Discord even if `/live` isn't done yet.

---

## File Structure

### `beemobot-api`

| File | Action | Responsibility |
|---|---|---|
| `app/services/riot_api_service.ts` | modify | Add `getActiveGameByPuuid` method (Spectator v5) |
| `app/services/debrief_service.ts` | create | Pure functions: stats computation + heuristic verdicts + global score |
| `app/services/predict_service.ts` | create | Pure functions: rank score + team avg + win% formula |
| `app/services/live_scout_service.ts` | create | Orchestration: enrich each Spectator participant with rank/mastery/winrate |
| `app/controllers/lol_controller.ts` | modify | Add 3 actions: `debriefByDiscord`, `predictByDiscord`, `scoutByDiscord` |
| `start/routes.ts` | modify | Register 3 new routes |
| `tests/unit/debrief_service.spec.ts` | create | Unit tests for heuristics & scoring |
| `tests/unit/predict_service.spec.ts` | create | Unit tests for rank scoring & win% |
| `tests/unit/live_scout_service.spec.ts` | create | Unit tests for winrate aggregation |
| `tests/functional/lol_debrief.spec.ts` | create | HTTP integration with mocked Riot |
| `tests/functional/lol_predict.spec.ts` | create | HTTP integration with mocked Riot |
| `tests/functional/lol_scout.spec.ts` | create | HTTP integration with mocked Riot |

### `bot`

| File | Action | Responsibility |
|---|---|---|
| `Discord/Commands/api_beemo.py` | modify | Add `get_debrief`, `get_predict`, `get_scout` wrappers |
| `Discord/Commands/embed_factory.py` | modify | Add `embed_debrief`, `embed_predict`, `embed_scout` builders |
| `Discord/Commands/debrief.py` | create | `/debrief` slash command |
| `Discord/Commands/predict.py` | create | `/predict` slash command |
| `Discord/Commands/live.py` | create | `/live` slash command |
| `Discord/Commands/global_commands.py` | modify | Register the 3 new commands |
| `Discord/Commands/help.py` | modify | Document the 3 new commands |

---

## Conventions used in this plan

- **Working directory** for API: `/Users/jeremy/Documents/Code/ynov/ydays/beemobot-api`
- **Working directory** for bot: `/Users/jeremy/Documents/Code/ynov/ydays/bot`
- **Test command (API)**: `pnpm test --filter "<name>"` or `pnpm test` for full
- **Typecheck (API)**: `pnpm typecheck`
- **Lint (API)**: `pnpm lint`
- **Bot dev run**: `python main.py` (interactive — for smoke tests)
- **All commits**: include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer
- **Commit prefixes**: `feat(api):`, `feat(bot):`, `test(api):`, `chore(bot):` per existing repo style
- **Riot mocking**: in functional tests, monkey-patch `RiotApiService.prototype.makeRequest` to return canned fixtures

---

## Task 1 — Spectator v5 method on RiotApiService

**Files:**
- Modify: `app/services/riot_api_service.ts` (add new method, ~30 lines)
- Create: `tests/unit/riot_api_service_spectator.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/riot_api_service_spectator.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import RiotApiService, { RiotApiError } from '#services/riot_api_service'

test.group('RiotApiService.getActiveGameByPuuid', () => {
  test('builds the Spectator v5 URL using the puuid', async ({ assert }) => {
    const service = new RiotApiService('euw1')
    let calledUrl = ''
    // @ts-expect-error — accessing private for unit test
    service.makeRequest = async (url: string) => {
      calledUrl = url
      return { gameId: 1, gameStartTime: 0, gameLength: 0, gameMode: 'CLASSIC',
               gameType: 'MATCHED_GAME', gameQueueConfigId: 420, mapId: 11,
               participants: [], bannedChampions: [] }
    }
    await service.getActiveGameByPuuid('PUUID_X')
    assert.equal(
      calledUrl,
      'https://euw1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/PUUID_X'
    )
  })

  test('propagates RiotApiError when Riot returns 404', async ({ assert }) => {
    const service = new RiotApiService('euw1')
    // @ts-expect-error — accessing private for unit test
    service.makeRequest = async () => {
      throw new RiotApiError(404, 'not found')
    }
    await assert.rejects(() => service.getActiveGameByPuuid('PUUID_X'), 'Not found')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/jeremy/Documents/Code/ynov/ydays/beemobot-api
pnpm test --filter "RiotApiService.getActiveGameByPuuid"
```

Expected: FAIL with `getActiveGameByPuuid is not a function`.

- [ ] **Step 3: Implement the method**

Append after `getMatchDetails` in `app/services/riot_api_service.ts`:

```ts
  /**
   * Récupère la game en cours d'un joueur (Spectator v5).
   * Throws RiotApiError(404) si le joueur n'est pas en game.
   */
  async getActiveGameByPuuid(puuid: string) {
    const url = `${this.baseUrl}/lol/spectator/v5/active-games/by-summoner/${puuid}`
    return this.makeRequest<{
      gameId: number
      gameStartTime: number
      gameLength: number
      gameMode: string
      gameType: string
      gameQueueConfigId: number
      mapId: number
      participants: Array<{
        puuid: string
        championId: number
        teamId: 100 | 200
        summonerId: string
        spell1Id: number
        spell2Id: number
        perks: { perkIds: number[]; perkStyle: number; perkSubStyle: number }
      }>
      bannedChampions: Array<{ championId: number; teamId: number; pickTurn: number }>
    }>(url)
  }
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --filter "RiotApiService.getActiveGameByPuuid"
pnpm typecheck
```

Expected: 2 tests pass, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/riot_api_service.ts tests/unit/riot_api_service_spectator.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add Spectator v5 endpoint to RiotApiService

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — DebriefService (heuristics + score)

**Files:**
- Create: `app/services/debrief_service.ts` (~140 lines)
- Create: `tests/unit/debrief_service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/debrief_service.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import DebriefService from '#services/debrief_service'

const baseParticipant = {
  championName: 'Jinx',
  teamPosition: 'BOTTOM',
  win: false,
  kills: 5, deaths: 5, assists: 5,
  totalMinionsKilled: 180, neutralMinionsKilled: 0,
  goldEarned: 12000,
  visionScore: 25,
  totalDamageDealtToChampions: 22000,
  challenges: { killParticipation: 0.5 },
}
const DURATION_25_MIN = 25 * 60

test.group('DebriefService.analyze', () => {
  test('computes basic stats correctly', ({ assert }) => {
    const r = DebriefService.analyze(baseParticipant, 'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5')
    assert.equal(r.stats.kda, 2.0)
    assert.equal(r.stats.csPerMin, 7.2)
    assert.equal(r.stats.goldPerMin, 480)
    assert.equal(r.stats.visionPerMin, 1.0)
    assert.closeTo(r.stats.damageRatio, 1.83, 0.01)
    assert.equal(r.stats.killParticipation, 0.5)
  })

  test('KDA < 1.0 produces a red verdict', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 1, deaths: 10, assists: 4 },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    const reds = r.verdicts.filter(v => v.severity === 'red')
    assert.isAtLeast(reds.length, 1)
    assert.match(reds[0].msg, /survie/i)
  })

  test('KDA > 4 with win produces a green carry verdict', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 12, deaths: 2, assists: 8, win: true },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.isTrue(r.verdicts.some(v => v.severity === 'green' && /carry/i.test(v.msg)))
  })

  test('low CS/min on lane produces yellow farm verdict', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, totalMinionsKilled: 90, teamPosition: 'BOTTOM' },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.isTrue(r.verdicts.some(v => v.severity === 'yellow' && /farm/i.test(v.msg)))
  })

  test('caps verdicts at 3 with priority red > yellow > green', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 0, deaths: 12, assists: 1,
        totalMinionsKilled: 50, visionScore: 5,
        challenges: { killParticipation: 0.1 } },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.lengthOf(r.verdicts, 3)
    // At least one red (KDA < 1)
    assert.isTrue(r.verdicts.some(v => v.severity === 'red'))
  })

  test('score is a letter grade', ({ assert }) => {
    const r = DebriefService.analyze(baseParticipant, 'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5')
    assert.match(r.score, /^[ABCDF][+-]?$|^F$/)
  })

  test('returns matchId, championName, win, durationMin', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, win: true },
      'EUW1_42', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.equal(r.matchId, 'EUW1_42')
    assert.equal(r.championName, 'Jinx')
    assert.equal(r.win, true)
    assert.equal(r.durationMin, 25)
    assert.equal(r.queueType, 'RANKED_SOLO_5x5')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "DebriefService"
```

Expected: FAIL with `Cannot find module '#services/debrief_service'`.

- [ ] **Step 3: Implement the service**

Create `app/services/debrief_service.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

export type Severity = 'red' | 'yellow' | 'green'

export interface DebriefVerdict {
  severity: Severity
  msg: string
}

export interface DebriefStats {
  kda: number
  csPerMin: number
  goldPerMin: number
  visionPerMin: number
  damageRatio: number
  killParticipation: number
}

export interface DebriefResult {
  matchId: string
  championName: string
  queueType: string
  win: boolean
  durationMin: number
  stats: DebriefStats
  verdicts: DebriefVerdict[]
  score: string
}

interface ParticipantInput {
  championName: string
  teamPosition: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  goldEarned: number
  visionScore: number
  totalDamageDealtToChampions: number
  challenges?: { killParticipation?: number }
}

interface ScoredVerdict extends DebriefVerdict {
  weight: number
  delta: number
}

const SEVERITY_VALUE: Record<Severity, number> = { red: 0, yellow: 5, green: 10 }
const SEVERITY_RANK: Record<Severity, number> = { red: 3, yellow: 2, green: 1 }

export default class DebriefService {
  static analyze(
    p: ParticipantInput,
    matchId: string,
    durationSec: number,
    queueType: string
  ): DebriefResult {
    const stats = computeStats(p, durationSec)
    const all = applyHeuristics(stats, p)
    const top = pickTop(all, 3)
    const score = computeScore(all)
    return {
      matchId,
      championName: p.championName,
      queueType,
      win: p.win,
      durationMin: Math.round(durationSec / 60),
      stats,
      verdicts: top.map(({ severity, msg }) => ({ severity, msg })),
      score,
    }
  }
}

function computeStats(p: ParticipantInput, durationSec: number): DebriefStats {
  const minutes = Math.max(durationSec / 60, 1)
  const cs = p.totalMinionsKilled + p.neutralMinionsKilled
  return {
    kda: round2((p.kills + p.assists) / Math.max(p.deaths, 1)),
    csPerMin: round2(cs / minutes),
    goldPerMin: Math.round(p.goldEarned / minutes),
    visionPerMin: round2(p.visionScore / minutes),
    damageRatio: round2(p.totalDamageDealtToChampions / Math.max(p.goldEarned, 1)),
    killParticipation: round2(p.challenges?.killParticipation ?? 0),
  }
}

function applyHeuristics(s: DebriefStats, p: ParticipantInput): ScoredVerdict[] {
  const out: ScoredVerdict[] = []
  const isLane = ['TOP', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(p.teamPosition)
  const isJungle = p.teamPosition === 'JUNGLE'
  const isCarry = p.teamPosition === 'BOTTOM' || p.teamPosition === 'MIDDLE'

  if (s.kda < 1.0) {
    out.push({ severity: 'red', weight: 2, delta: 1.0 - s.kda,
      msg: `Tu es mort plus que tu as contribué (KDA ${s.kda}) — focus survie` })
  }
  if (s.kda > 4.0 && p.win) {
    out.push({ severity: 'green', weight: 2, delta: s.kda - 4.0,
      msg: `Carry-game propre (KDA ${s.kda}) 👏` })
  }
  if (isLane && s.csPerMin < 5) {
    out.push({ severity: 'yellow', weight: 1, delta: 5 - s.csPerMin,
      msg: `Farm en dessous du standard (${s.csPerMin}/min) — pratique le CS en custom` })
  }
  if (isJungle && s.csPerMin < 4) {
    out.push({ severity: 'yellow', weight: 1, delta: 4 - s.csPerMin,
      msg: `Farm jungle bas (${s.csPerMin}/min) — clean tes camps plus vite` })
  }
  if (isLane && s.csPerMin > 8) {
    out.push({ severity: 'green', weight: 1, delta: s.csPerMin - 8,
      msg: `Excellent farm (${s.csPerMin}/min)` })
  }
  if (s.visionPerMin < 1) {
    out.push({ severity: 'yellow', weight: 1, delta: 1 - s.visionPerMin,
      msg: `Vision insuffisante (${s.visionPerMin}/min — vise 1+)` })
  }
  if (s.damageRatio > 2.5) {
    out.push({ severity: 'green', weight: 1, delta: s.damageRatio - 2.5,
      msg: `Excellent dmg/gold (${s.damageRatio}) — or bien valorisé` })
  }
  if (isCarry && s.damageRatio < 1.0) {
    out.push({ severity: 'yellow', weight: 1, delta: 1.0 - s.damageRatio,
      msg: `Peu de dégâts pour ton rôle (dmg/gold ${s.damageRatio})` })
  }
  if (s.killParticipation > 0.7 && p.win) {
    out.push({ severity: 'green', weight: 1, delta: s.killParticipation - 0.7,
      msg: `Très impliqué dans les fights (${Math.round(s.killParticipation * 100)}%)` })
  }
  if (s.killParticipation < 0.3) {
    out.push({ severity: 'yellow', weight: 1, delta: 0.3 - s.killParticipation,
      msg: `Peu impliqué dans les fights — colle ton équipe en mid-game` })
  }
  return out
}

function pickTop(verdicts: ScoredVerdict[], n: number): ScoredVerdict[] {
  return [...verdicts]
    .sort((a, b) => {
      const r = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      if (r !== 0) return r
      return b.delta - a.delta
    })
    .slice(0, n)
}

function computeScore(all: ScoredVerdict[]): string {
  if (all.length === 0) return 'B'
  const totalWeight = all.reduce((s, v) => s + v.weight, 0)
  const weighted = all.reduce((s, v) => s + SEVERITY_VALUE[v.severity] * v.weight, 0)
  const avg = weighted / totalWeight  // 0..10
  // Map 0..10 to letter grades
  if (avg >= 9) return 'A+'
  if (avg >= 8) return 'A'
  if (avg >= 7) return 'B+'
  if (avg >= 6) return 'B'
  if (avg >= 5) return 'C+'
  if (avg >= 4) return 'C'
  if (avg >= 2) return 'D'
  return 'F'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test --filter "DebriefService"
pnpm typecheck
```

Expected: 7 tests pass, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/debrief_service.ts tests/unit/debrief_service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add DebriefService with heuristic verdicts and letter score

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `/lol/debrief/by-discord/:id` endpoint

**Files:**
- Modify: `app/controllers/lol_controller.ts` (add action)
- Modify: `start/routes.ts` (add route)
- Create: `tests/functional/lol_debrief.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/functional/lol_debrief.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'

const FIXTURE_PARTICIPANT = {
  puuid: 'PUUID_LINKED',
  championName: 'Jinx',
  teamPosition: 'BOTTOM',
  win: true,
  kills: 8, deaths: 3, assists: 12,
  totalMinionsKilled: 220, neutralMinionsKilled: 5,
  goldEarned: 14000, visionScore: 32,
  totalDamageDealtToChampions: 28000,
  challenges: { killParticipation: 0.74 },
}

test.group('GET /lol/debrief/by-discord/:id', (group) => {
  group.each.setup(async () => {
    await User.truncate(true)
  })

  test('returns 404 not_linked when no user found', async ({ client, assert }) => {
    const response = await client.get('/lol/debrief/by-discord/UNKNOWN_DISCORD_ID')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 not_linked when user has no riot_puuid', async ({ client, assert }) => {
    await User.create({ discordId: 'D1', username: 'u' })
    const response = await client.get('/lol/debrief/by-discord/D1')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 no_recent_match when match history is empty', async ({ client, assert }) => {
    await User.create({
      discordId: 'D2', username: 'u',
      riotPuuid: 'PUUID_LINKED', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch private method
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/match/v5/matches/by-puuid')) return []
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/debrief/by-discord/D2')
    response.assertStatus(404)
    assert.equal(response.body().error, 'no_recent_match')
  })

  test('returns 200 with stats and verdicts on a real match', async ({ client, assert }) => {
    await User.create({
      discordId: 'D3', username: 'u',
      riotPuuid: 'PUUID_LINKED', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch private method
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/match/v5/matches/by-puuid')) return ['EUW1_M42']
      if (url.includes('/lol/match/v5/matches/EUW1_M42')) {
        return {
          info: {
            gameDuration: 25 * 60,
            queueId: 420,
            participants: [FIXTURE_PARTICIPANT],
          },
        }
      }
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/debrief/by-discord/D3')
    response.assertStatus(200)
    assert.equal(response.body().matchId, 'EUW1_M42')
    assert.equal(response.body().championName, 'Jinx')
    assert.equal(response.body().win, true)
    assert.exists(response.body().stats)
    assert.isArray(response.body().verdicts)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "GET /lol/debrief"
```

Expected: FAIL with 404 on the route (route not registered yet).

- [ ] **Step 3: Add the route in `start/routes.ts`**

Find the LoL routes section (look for `LolController`). Add this near the other `/lol/*` routes:

```ts
router.get('/lol/debrief/by-discord/:id', [LolController, 'debriefByDiscord'])
```

- [ ] **Step 4: Add the controller action**

In `app/controllers/lol_controller.ts`, add at the top (after existing imports):

```ts
import User from '#models/user'
import DebriefService from '#services/debrief_service'
```

Add a new method inside `LolController` class:

```ts
  async debriefByDiscord({ params, response }: HttpContext) {
    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      return response.status(404).json({ error: 'not_linked' })
    }
    const riot = new RiotApiService('euw1')
    const matchIds = await riot.getMatchHistory(user.riotPuuid, 'europe', 0, 1)
    if (matchIds.length === 0) {
      return response.status(404).json({ error: 'no_recent_match' })
    }
    const matchId = matchIds[0]
    const match = await riot.getMatchDetails(matchId, 'europe')
    const participant = match.info.participants.find((p: any) => p.puuid === user.riotPuuid)
    if (!participant) {
      return response.status(404).json({ error: 'no_recent_match' })
    }
    const queueType = mapQueueId(match.info.queueId)
    const result = DebriefService.analyze(participant, matchId, match.info.gameDuration, queueType)
    return response.json(result)
  }
```

Add this helper at the bottom of the file (outside the class):

```ts
function mapQueueId(queueId: number): string {
  const map: Record<number, string> = {
    420: 'RANKED_SOLO_5x5',
    440: 'RANKED_FLEX_SR',
    400: 'NORMAL_DRAFT',
    430: 'NORMAL_BLIND',
    450: 'ARAM',
    700: 'CLASH',
  }
  return map[queueId] ?? `QUEUE_${queueId}`
}
```

- [ ] **Step 5: Run tests + typecheck + commit**

```bash
pnpm test --filter "GET /lol/debrief"
pnpm typecheck
```

Expected: 4 tests pass.

```bash
git add app/controllers/lol_controller.ts start/routes.ts tests/functional/lol_debrief.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET /lol/debrief/by-discord/:id endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `/debrief` slash command (bot)

**Files:**
- Modify: `Discord/Commands/api_beemo.py` (add `get_debrief` wrapper)
- Modify: `Discord/Commands/embed_factory.py` (add `embed_debrief`)
- Create: `Discord/Commands/debrief.py` (slash command)
- Modify: `Discord/Commands/global_commands.py` (register)

> Note: the bot has no test framework installed. Verification = manual smoke test after task 12.

- [ ] **Step 1: Add the API wrapper**

In `Discord/Commands/api_beemo.py`, append in the "Public endpoints" section:

```python
async def get_debrief(discord_id: str):
    return await _request("GET", f"/lol/debrief/by-discord/{discord_id}")
```

- [ ] **Step 2: Add the embed factory**

In `Discord/Commands/embed_factory.py`, append a new function:

```python
def embed_debrief(data: dict) -> discord.Embed:
    """Embed for /debrief — recap of last match with heuristic verdicts."""
    win = data.get("win", False)
    color = 0x2ECC71 if win else 0xE74C3C
    title = f"{'🏆' if win else '💀'} Debrief — {data.get('championName', 'Champion')}"

    stats = data.get("stats", {})
    verdicts = data.get("verdicts", [])

    description = (
        f"**Score** : `{data.get('score', 'B')}` · "
        f"**Durée** : `{data.get('durationMin', 0)} min` · "
        f"**Queue** : `{data.get('queueType', 'UNKNOWN')}`\n\n"
        f"**KDA** `{stats.get('kda', 0)}` · "
        f"**CS/min** `{stats.get('csPerMin', 0)}` · "
        f"**Vision/min** `{stats.get('visionPerMin', 0)}`\n"
        f"**Gold/min** `{stats.get('goldPerMin', 0)}` · "
        f"**Dmg/Gold** `{stats.get('damageRatio', 0)}` · "
        f"**KP** `{int(stats.get('killParticipation', 0) * 100)}%`"
    )

    embed = discord.Embed(title=title, description=description, color=color)

    if verdicts:
        verdict_text = "\n".join(f"{_severity_emoji(v['severity'])} {v['msg']}" for v in verdicts)
        embed.add_field(name="🎯 Verdicts", value=verdict_text, inline=False)

    embed.set_footer(text=f"Match {data.get('matchId', '?')}")
    return embed


def _severity_emoji(severity: str) -> str:
    return {"red": "🔴", "yellow": "🟡", "green": "🟢"}.get(severity, "⚪")
```

Make sure `import discord` is present at the top of `embed_factory.py` (it already is).

- [ ] **Step 3: Create the slash command**

Create `Discord/Commands/debrief.py`:

```python
# Last updated: 2026-05-07
import discord
from Discord.Commands.api_beemo import get_debrief
from Discord.Commands.embed_factory import embed_debrief


def register_debrief(bot):
    @bot.tree.command(name="debrief", description="Analyse de ta dernière game")
    async def debrief_cmd(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        data = await get_debrief(str(interaction.user.id))

        if data is None:
            return await interaction.followup.send(
                "⚠️ Erreur API — réessaie dans quelques secondes.", ephemeral=True
            )
        if data.get("error") == "not_linked":
            return await interaction.followup.send(
                "❌ Lie ton compte d'abord avec `/link`.", ephemeral=True
            )
        if data.get("error") == "no_recent_match":
            return await interaction.followup.send(
                "❌ Aucune game récente trouvée.", ephemeral=True
            )

        await interaction.followup.send(embed=embed_debrief(data), ephemeral=True)
```

> Note: the existing `_request` returns `None` on HTTP error, but for 404 with a body it currently returns `None` too. We need a stricter wrapper for these cases — see step 4.

- [ ] **Step 4: Improve `_request` to expose 404 bodies**

The current `_request` discards the body on `>=400`. For our error contract, we need to surface `{ "error": "not_linked" }` etc. Modify `Discord/Commands/api_beemo.py`:

```python
async def _request(method: str, path: str, json: dict | None = None, internal: bool = False):
    url = f"{BEEMO_API_BASE_URL}{path}"
    headers = _internal_headers() if internal else None
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            async with session.request(method, url, json=json, headers=headers) as resp:
                if resp.status == 404:
                    # 404 may carry a structured error body — expose it to callers.
                    try:
                        return await resp.json()
                    except Exception:
                        return None
                if resp.status >= 400:
                    body = await resp.text()
                    logger.warning("%s %s -> %d: %s", method, url, resp.status, body)
                    return None
                if resp.content_length == 0 or resp.status == 204:
                    return {}
                return await resp.json()
    except aiohttp.ClientError as exc:
        logger.error("%s %s failed: %s", method, url, exc)
        return None
```

This is a backward-compatible change: existing callers (`get_profile`, etc.) handle `None` for any non-success and a dict for success — the only new case is "404 with structured body" which they don't currently encounter.

- [ ] **Step 5: Register the command**

In `Discord/Commands/global_commands.py`, add the import and registration:

```python
from Discord.Commands.debrief import register_debrief
```

And inside the `register_global_commands(bot)` function (or wherever the other `register_*` calls live):

```python
register_debrief(bot)
```

- [ ] **Step 6: Commit**

```bash
cd /Users/jeremy/Documents/Code/ynov/ydays/bot
git add Discord/Commands/api_beemo.py Discord/Commands/embed_factory.py Discord/Commands/debrief.py Discord/Commands/global_commands.py
git commit -m "$(cat <<'EOF'
feat(bot): add /debrief slash command for match analysis

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — PredictService

**Files:**
- Create: `app/services/predict_service.ts` (~80 lines)
- Create: `tests/unit/predict_service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/predict_service.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import PredictService from '#services/predict_service'

const D2_RANK = { tier: 'DIAMOND', division: 'II', hotStreak: false, masteryPoints: 0 }
const G4_RANK = { tier: 'GOLD', division: 'IV', hotStreak: false, masteryPoints: 0 }
const UNRANKED = null

test.group('PredictService.rankScore', () => {
  test('Diamond II = 26', ({ assert }) => {
    assert.equal(PredictService.rankScore(D2_RANK), 26)
  })
  test('Gold IV = 12', ({ assert }) => {
    assert.equal(PredictService.rankScore(G4_RANK), 12)
  })
  test('unranked defaults to 8 (Silver IV equivalent)', ({ assert }) => {
    assert.equal(PredictService.rankScore(UNRANKED), 8)
  })
  test('hot streak adds 2', ({ assert }) => {
    assert.equal(PredictService.rankScore({ ...D2_RANK, hotStreak: true }), 28)
  })
  test('mastery > 100k adds 1', ({ assert }) => {
    assert.equal(PredictService.rankScore({ ...D2_RANK, masteryPoints: 150_000 }), 27)
  })
})

test.group('PredictService.predictWinPct', () => {
  test('equal teams => 50%', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(20, 20), 50)
  })
  test('+6 score advantage => 65%', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(26, 20), 65)
  })
  test('-10 score => 25%', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(20, 30), 25)
  })
  test('clamps to [15, 85]', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(50, 0), 85)
    assert.equal(PredictService.predictWinPct(0, 50), 15)
  })
})

test.group('PredictService.explain', () => {
  test('returns "match équilibré" for small diff', ({ assert }) => {
    assert.match(PredictService.explain(2), /équilibré/i)
  })
  test('returns advantage message for diff > 4', ({ assert }) => {
    assert.match(PredictService.explain(6), /avantage/i)
  })
  test('returns disadvantage for diff < -4', ({ assert }) => {
    assert.match(PredictService.explain(-6), /désavantage/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "PredictService"
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the service**

Create `app/services/predict_service.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

export interface RankInput {
  tier: string
  division: string
  hotStreak: boolean
  masteryPoints: number
}

const TIER_VALUE: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5,
  DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
}
const DIV_VALUE: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }
const UNRANKED_DEFAULT = 8 // Silver IV equivalent

export default class PredictService {
  static rankScore(rank: RankInput | null): number {
    if (!rank) return UNRANKED_DEFAULT
    const t = TIER_VALUE[rank.tier] ?? 2
    const d = DIV_VALUE[rank.division] ?? 0
    let score = t * 4 + d
    if (rank.hotStreak) score += 2
    if (rank.masteryPoints > 100_000) score += 1
    return score
  }

  static predictWinPct(myTeamAvg: number, oppTeamAvg: number): number {
    const diff = myTeamAvg - oppTeamAvg
    const adjusted = 50 + Math.max(-35, Math.min(35, diff * 2.5))
    return Math.round(adjusted)
  }

  static explain(diff: number): string {
    if (diff > 8) return 'Tu es nettement favorisé.'
    if (diff > 4) return 'Léger avantage de ton côté.'
    if (diff < -8) return 'Équipe adverse nettement plus forte.'
    if (diff < -4) return 'Léger désavantage.'
    return 'Match équilibré.'
  }
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm test --filter "PredictService"
pnpm typecheck
```

Expected: 11 tests pass, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/predict_service.ts tests/unit/predict_service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add PredictService with rank scoring and win% formula

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — `/lol/predict/by-discord/:id` endpoint

**Files:**
- Modify: `app/controllers/lol_controller.ts`
- Modify: `start/routes.ts`
- Create: `tests/functional/lol_predict.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/functional/lol_predict.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'

test.group('GET /lol/predict/by-discord/:id', (group) => {
  group.each.setup(async () => {
    await User.truncate(true)
  })

  test('returns 404 not_linked when user has no riot_puuid', async ({ client, assert }) => {
    await User.create({ discordId: 'D1', username: 'u' })
    const response = await client.get('/lol/predict/by-discord/D1')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 not_in_game when Spectator returns 404', async ({ client, assert }) => {
    await User.create({
      discordId: 'D2', username: 'u',
      riotPuuid: 'PUUID_LINKED', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    const { RiotApiError } = await import('#services/riot_api_service')
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) throw new RiotApiError(404, '')
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/predict/by-discord/D2')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_in_game')
  })

  test('returns 200 with team scores and winPct', async ({ client, assert }) => {
    await User.create({
      discordId: 'D3', username: 'u',
      riotPuuid: 'P_SELF', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) {
        return {
          gameId: 1, gameStartTime: 0, gameLength: 60,
          gameMode: 'CLASSIC', gameType: 'MATCHED_GAME',
          gameQueueConfigId: 420, mapId: 11,
          participants: [
            { puuid: 'P_SELF', championId: 222, teamId: 100, summonerId: 'S1', spell1Id: 4, spell2Id: 7, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
            { puuid: 'P_A', championId: 8, teamId: 200, summonerId: 'S2', spell1Id: 4, spell2Id: 12, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
          ],
          bannedChampions: [],
        }
      }
      if (url.includes('/lol/league/v4/entries/by-puuid/P_SELF')) {
        return [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'IV', leaguePoints: 0, wins: 0, losses: 0, hotStreak: false }]
      }
      if (url.includes('/lol/league/v4/entries/by-puuid/P_A')) {
        return [{ queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'II', leaguePoints: 0, wins: 0, losses: 0, hotStreak: false }]
      }
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/predict/by-discord/D3')
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.self.teamId, 100)
    assert.equal(body.teamScores['100'], 12) // Gold IV
    assert.equal(body.teamScores['200'], 26) // Diamond II
    assert.equal(body.diff, -14)
    assert.equal(body.winPct, 15) // clamp to 15
    assert.match(body.explanation, /nettement plus forte/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "GET /lol/predict"
```

Expected: FAIL (route not registered).

- [ ] **Step 3: Add the route**

In `start/routes.ts`, near other `/lol/*` routes:

```ts
router.get('/lol/predict/by-discord/:id', [LolController, 'predictByDiscord'])
```

- [ ] **Step 4: Add the controller action**

In `app/controllers/lol_controller.ts`, add this import at the top if not already there:

```ts
import PredictService from '#services/predict_service'
import { RiotApiError } from '#services/riot_api_service'
```

Add inside `LolController`:

```ts
  async predictByDiscord({ params, response }: HttpContext) {
    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      return response.status(404).json({ error: 'not_linked' })
    }
    const riot = new RiotApiService('euw1')
    let active
    try {
      active = await riot.getActiveGameByPuuid(user.riotPuuid)
    } catch (err) {
      if (err instanceof RiotApiError && err.statusCode === 404) {
        return response.status(404).json({ error: 'not_in_game' })
      }
      throw err
    }

    const ranks = await Promise.all(
      active.participants.map(async (p) => {
        try {
          const entries = await riot.getSummonerRank(p.puuid)
          const solo = entries.find((e: any) => e.queueType === 'RANKED_SOLO_5x5') ?? entries[0] ?? null
          return { puuid: p.puuid, teamId: p.teamId, rank: solo }
        } catch {
          return { puuid: p.puuid, teamId: p.teamId, rank: null }
        }
      })
    )

    const scoresByTeam: Record<number, number[]> = { 100: [], 200: [] }
    for (const r of ranks) {
      const s = PredictService.rankScore(
        r.rank
          ? {
              tier: r.rank.tier,
              division: r.rank.rank,
              hotStreak: r.rank.hotStreak,
              masteryPoints: 0,
            }
          : null
      )
      scoresByTeam[r.teamId].push(s)
    }

    const avg100 = scoresByTeam[100].length
      ? Math.round((scoresByTeam[100].reduce((a, b) => a + b, 0) / scoresByTeam[100].length) * 10) / 10
      : 0
    const avg200 = scoresByTeam[200].length
      ? Math.round((scoresByTeam[200].reduce((a, b) => a + b, 0) / scoresByTeam[200].length) * 10) / 10
      : 0

    const selfTeam = active.participants.find((p) => p.puuid === user.riotPuuid)?.teamId ?? 100
    const myAvg = selfTeam === 100 ? avg100 : avg200
    const oppAvg = selfTeam === 100 ? avg200 : avg100
    const diff = Math.round((myAvg - oppAvg) * 10) / 10

    return response.json({
      gameId: String(active.gameId),
      self: { teamId: selfTeam },
      teamScores: { '100': avg100, '200': avg200 },
      diff,
      winPct: PredictService.predictWinPct(myAvg, oppAvg),
      explanation: PredictService.explain(diff),
    })
  }
```

- [ ] **Step 5: Run tests + typecheck + commit**

```bash
pnpm test --filter "GET /lol/predict"
pnpm typecheck
```

Expected: 3 tests pass.

```bash
git add app/controllers/lol_controller.ts start/routes.ts tests/functional/lol_predict.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET /lol/predict/by-discord/:id endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — `/predict` slash command (bot)

**Files:**
- Modify: `Discord/Commands/api_beemo.py`
- Modify: `Discord/Commands/embed_factory.py`
- Create: `Discord/Commands/predict.py`
- Modify: `Discord/Commands/global_commands.py`

- [ ] **Step 1: Add API wrapper**

In `Discord/Commands/api_beemo.py`:

```python
async def get_predict(discord_id: str):
    return await _request("GET", f"/lol/predict/by-discord/{discord_id}")
```

- [ ] **Step 2: Add embed factory**

In `Discord/Commands/embed_factory.py`:

```python
def embed_predict(data: dict) -> discord.Embed:
    """Embed for /predict — win probability based on rank average."""
    win_pct = data.get("winPct", 50)
    color = 0x2ECC71 if win_pct >= 55 else 0xE74C3C if win_pct <= 45 else 0xF1C40F

    self_team = str(data.get("self", {}).get("teamId", 100))
    other_team = "200" if self_team == "100" else "100"
    scores = data.get("teamScores", {})

    description = (
        f"**Probabilité de win** : `{win_pct}%`\n\n"
        f"🟦 **Ton équipe** — score moyen `{scores.get(self_team, 0)}`\n"
        f"🟥 **Adverse** — score moyen `{scores.get(other_team, 0)}`\n"
        f"**Diff** : `{data.get('diff', 0)}`\n\n"
        f"_{data.get('explanation', '')}_"
    )

    return discord.Embed(
        title=f"🎯 Prédiction — {win_pct}%",
        description=description,
        color=color,
    )
```

- [ ] **Step 3: Create the slash command**

Create `Discord/Commands/predict.py`:

```python
# Last updated: 2026-05-07
import discord
from Discord.Commands.api_beemo import get_predict
from Discord.Commands.embed_factory import embed_predict


def register_predict(bot):
    @bot.tree.command(name="predict", description="Prédiction win% de ta game en cours")
    async def predict_cmd(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        data = await get_predict(str(interaction.user.id))

        if data is None:
            return await interaction.followup.send(
                "⚠️ Erreur API — réessaie dans quelques secondes.", ephemeral=True
            )
        if data.get("error") == "not_linked":
            return await interaction.followup.send(
                "❌ Lie ton compte d'abord avec `/link`.", ephemeral=True
            )
        if data.get("error") == "not_in_game":
            return await interaction.followup.send(
                "❌ Tu n'es pas en game actuellement.", ephemeral=True
            )

        await interaction.followup.send(embed=embed_predict(data), ephemeral=True)
```

- [ ] **Step 4: Register**

In `Discord/Commands/global_commands.py`:

```python
from Discord.Commands.predict import register_predict
```

And inside `register_global_commands(bot)`:

```python
register_predict(bot)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jeremy/Documents/Code/ynov/ydays/bot
git add Discord/Commands/api_beemo.py Discord/Commands/embed_factory.py Discord/Commands/predict.py Discord/Commands/global_commands.py
git commit -m "$(cat <<'EOF'
feat(bot): add /predict slash command for live win probability

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — LiveScoutService (champion winrate aggregation)

**Files:**
- Create: `app/services/live_scout_service.ts` (~120 lines)
- Create: `tests/unit/live_scout_service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/live_scout_service.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import LiveScoutService from '#services/live_scout_service'

test.group('LiveScoutService.aggregateChampionWinrate', () => {
  test('returns games=0 when no matches', ({ assert }) => {
    const stats = LiveScoutService.aggregateChampionWinrate([], 'P_X', 222)
    assert.deepEqual(stats, { games: 0, wins: 0, winPct: 0 })
  })

  test('counts only matches where the puuid played the champion', ({ assert }) => {
    const matches = [
      { info: { participants: [
        { puuid: 'P_X', championId: 222, win: true },
      ]}},
      { info: { participants: [
        { puuid: 'P_X', championId: 11, win: false },  // different champion, ignored
      ]}},
      { info: { participants: [
        { puuid: 'P_X', championId: 222, win: false },
      ]}},
    ]
    const stats = LiveScoutService.aggregateChampionWinrate(matches as any, 'P_X', 222)
    assert.equal(stats.games, 2)
    assert.equal(stats.wins, 1)
    assert.equal(stats.winPct, 50)
  })

  test('rounds winPct to integer', ({ assert }) => {
    const matches = Array.from({ length: 7 }, (_, i) => ({
      info: { participants: [{ puuid: 'P_X', championId: 222, win: i < 5 }] },
    }))
    const stats = LiveScoutService.aggregateChampionWinrate(matches as any, 'P_X', 222)
    assert.equal(stats.games, 7)
    assert.equal(stats.wins, 5)
    assert.equal(stats.winPct, 71) // 5/7 = 71.4
  })
})

test.group('LiveScoutService.pickThreats', () => {
  test('picks the top adversary by combined rank+mastery score', ({ assert }) => {
    const opps = [
      { puuid: 'P_A', championName: 'Vladimir', rank: { tier: 'DIAMOND', rank: 'II' }, championMastery: { points: 350_000 }, championStats: { winPct: 60 } },
      { puuid: 'P_B', championName: 'Ornn',     rank: { tier: 'GOLD',    rank: 'IV' }, championMastery: { points: 12_000 },  championStats: { winPct: 45 } },
      { puuid: 'P_C', championName: 'Caitlyn',  rank: null,                            championMastery: { points: 0 },        championStats: { winPct: 30 } },
    ]
    const threats = LiveScoutService.pickThreats(opps as any, 1)
    assert.lengthOf(threats, 1)
    assert.equal(threats[0].championName, 'Vladimir')
    assert.match(threats[0].reason, /Diamond II/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "LiveScoutService"
```

Expected: FAIL with `Cannot find module`.

- [ ] **Step 3: Implement the service**

Create `app/services/live_scout_service.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import RiotApiService, { RiotPlatform } from '#services/riot_api_service'
import PredictService from '#services/predict_service'

export interface ScoutParticipant {
  puuid: string
  championId: number
  championName: string
  teamId: 100 | 200
  summonerSpells: [number, number]
  rank: {
    tier: string
    rank: string
    leaguePoints: number
    wins: number
    losses: number
    hotStreak: boolean
  } | null
  championMastery: { level: number; points: number } | null
  championStats: { games: number; wins: number; winPct: number }
}

export interface ScoutResult {
  gameId: string
  gameStartTime: number
  gameLength: number
  queueType: string
  mapId: number
  self: { puuid: string; championName: string; teamId: number }
  teams: { '100': ScoutParticipant[]; '200': ScoutParticipant[] }
  topThreats: Array<{ puuid: string; championName: string; reason: string }>
  predictionWinPct: number
}

interface MatchLite {
  info: { participants: Array<{ puuid: string; championId: number; win: boolean }> }
}

export default class LiveScoutService {
  static aggregateChampionWinrate(
    matches: MatchLite[],
    puuid: string,
    championId: number
  ): { games: number; wins: number; winPct: number } {
    let games = 0
    let wins = 0
    for (const m of matches) {
      const p = m.info.participants.find((x) => x.puuid === puuid && x.championId === championId)
      if (!p) continue
      games++
      if (p.win) wins++
    }
    return { games, wins, winPct: games > 0 ? Math.round((wins / games) * 100) : 0 }
  }

  static pickThreats(
    opponents: ScoutParticipant[],
    n: number
  ): Array<{ puuid: string; championName: string; reason: string }> {
    const scored = opponents.map((p) => {
      const rankScore = PredictService.rankScore(
        p.rank
          ? { tier: p.rank.tier, division: p.rank.rank, hotStreak: p.rank.hotStreak, masteryPoints: p.championMastery?.points ?? 0 }
          : null
      )
      const wrBonus = p.championStats.games >= 5 && p.championStats.winPct >= 60 ? 3 : 0
      return { p, score: rankScore + wrBonus }
    })
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(({ p }) => ({
        puuid: p.puuid,
        championName: p.championName,
        reason: buildReason(p),
      }))
  }

  static async enrich(
    riot: RiotApiService,
    activeGame: any,
    selfPuuid: string,
    championNameById: Record<number, string>,
    platform: RiotPlatform = 'europe'
  ): Promise<ScoutResult> {
    const enrichedParticipants: ScoutParticipant[] = await Promise.all(
      activeGame.participants.map(async (p: any) => {
        const [rankEntries, masteries, matchIds] = await Promise.all([
          riot.getSummonerRank(p.puuid).catch(() => []),
          riot.getTopChampionMasteries(p.puuid, 5).catch(() => []),
          riot.getMatchHistory(p.puuid, platform, 0, 10).catch(() => []),
        ])
        const matches = await Promise.all(
          matchIds.slice(0, 10).map((id) => riot.getMatchDetails(id, platform).catch(() => null))
        )
        const validMatches = matches.filter((m): m is MatchLite => m !== null)
        const championStats = LiveScoutService.aggregateChampionWinrate(validMatches, p.puuid, p.championId)

        const solo = rankEntries.find((e: any) => e.queueType === 'RANKED_SOLO_5x5') ?? rankEntries[0] ?? null
        const championMastery = masteries.find((m: any) => m.championId === p.championId) ?? null

        return {
          puuid: p.puuid,
          championId: p.championId,
          championName: championNameById[p.championId] ?? `Champion${p.championId}`,
          teamId: p.teamId,
          summonerSpells: [p.spell1Id, p.spell2Id] as [number, number],
          rank: solo,
          championMastery: championMastery ? { level: championMastery.championLevel, points: championMastery.championPoints } : null,
          championStats,
        }
      })
    )

    const teams = { '100': [] as ScoutParticipant[], '200': [] as ScoutParticipant[] }
    for (const p of enrichedParticipants) teams[String(p.teamId) as '100' | '200'].push(p)

    const selfP = enrichedParticipants.find((p) => p.puuid === selfPuuid)
    const selfTeamId = selfP?.teamId ?? 100
    const opponents = enrichedParticipants.filter((p) => p.teamId !== selfTeamId)
    const topThreats = LiveScoutService.pickThreats(opponents, 1)

    const myAvg = avg(teams[String(selfTeamId) as '100' | '200'].map((p) => scoreOf(p)))
    const oppAvg = avg(teams[selfTeamId === 100 ? '200' : '100'].map((p) => scoreOf(p)))

    return {
      gameId: String(activeGame.gameId),
      gameStartTime: activeGame.gameStartTime,
      gameLength: activeGame.gameLength,
      queueType: mapQueueId(activeGame.gameQueueConfigId),
      mapId: activeGame.mapId,
      self: {
        puuid: selfPuuid,
        championName: selfP?.championName ?? 'Unknown',
        teamId: selfTeamId,
      },
      teams,
      topThreats,
      predictionWinPct: PredictService.predictWinPct(myAvg, oppAvg),
    }
  }
}

function scoreOf(p: ScoutParticipant): number {
  return PredictService.rankScore(
    p.rank
      ? { tier: p.rank.tier, division: p.rank.rank, hotStreak: p.rank.hotStreak, masteryPoints: p.championMastery?.points ?? 0 }
      : null
  )
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function buildReason(p: ScoutParticipant): string {
  const parts: string[] = []
  if (p.rank) parts.push(`${capital(p.rank.tier)} ${p.rank.rank}`)
  if (p.championMastery) parts.push(`${Math.round(p.championMastery.points / 1000)}k mastery`)
  if (p.championStats.games >= 5) parts.push(`${p.championStats.winPct}% WR sur ${p.championName}`)
  return parts.join(' · ')
}

function capital(s: string): string {
  return s[0] + s.slice(1).toLowerCase()
}

function mapQueueId(queueId: number): string {
  const map: Record<number, string> = {
    420: 'RANKED_SOLO_5x5', 440: 'RANKED_FLEX_SR', 400: 'NORMAL_DRAFT',
    430: 'NORMAL_BLIND', 450: 'ARAM', 700: 'CLASH',
  }
  return map[queueId] ?? `QUEUE_${queueId}`
}
```

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm test --filter "LiveScoutService"
pnpm typecheck
```

Expected: 4 tests pass, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add app/services/live_scout_service.ts tests/unit/live_scout_service.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add LiveScoutService for game scouting orchestration

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9 — `/lol/scout/by-discord/:id` endpoint

**Files:**
- Modify: `app/controllers/lol_controller.ts`
- Modify: `start/routes.ts`
- Create: `tests/functional/lol_scout.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/functional/lol_scout.spec.ts`:

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'

test.group('GET /lol/scout/by-discord/:id', (group) => {
  group.each.setup(async () => {
    await User.truncate(true)
  })

  test('returns 404 not_linked when user has no riot_puuid', async ({ client, assert }) => {
    await User.create({ discordId: 'D1', username: 'u' })
    const response = await client.get('/lol/scout/by-discord/D1')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 not_in_game when Spectator returns 404', async ({ client, assert }) => {
    await User.create({
      discordId: 'D2', username: 'u',
      riotPuuid: 'P_S', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    const { RiotApiError } = await import('#services/riot_api_service')
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) throw new RiotApiError(404, '')
      // For DataDragon (champion list), return empty so the controller doesn't crash
      return { data: {} }
    }
    const response = await client.get('/lol/scout/by-discord/D2')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_in_game')
  })

  test('returns 200 with enriched participants', async ({ client, assert }) => {
    await User.create({
      discordId: 'D3', username: 'u',
      riotPuuid: 'P_S', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) {
        return {
          gameId: 1, gameStartTime: 1715000000000, gameLength: 180,
          gameMode: 'CLASSIC', gameType: 'MATCHED_GAME',
          gameQueueConfigId: 420, mapId: 11,
          participants: [
            { puuid: 'P_S', championId: 222, teamId: 100, summonerId: 'S1', spell1Id: 4, spell2Id: 7, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
            { puuid: 'P_O', championId: 8,   teamId: 200, summonerId: 'S2', spell1Id: 4, spell2Id: 12, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
          ],
          bannedChampions: [],
        }
      }
      if (url.includes('/lol/league/v4')) return [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 0, wins: 10, losses: 5, hotStreak: false }]
      if (url.includes('/lol/champion-mastery/v4')) return []
      if (url.includes('/lol/match/v5/matches/by-puuid')) return []
      if (url.includes('/cdn/') && url.includes('champion.json')) {
        return { data: {
          Jinx: { key: '222', name: 'Jinx', id: 'Jinx' },
          Vladimir: { key: '8', name: 'Vladimir', id: 'Vladimir' },
        }}
      }
      if (url.includes('versions.json')) return ['14.1.1']
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/scout/by-discord/D3')
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.self.championName, 'Jinx')
    assert.equal(body.self.teamId, 100)
    assert.lengthOf(body.teams['100'], 1)
    assert.lengthOf(body.teams['200'], 1)
    assert.exists(body.predictionWinPct)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "GET /lol/scout"
```

Expected: FAIL (route not registered).

- [ ] **Step 3: Add the route**

In `start/routes.ts`:

```ts
router.get('/lol/scout/by-discord/:id', [LolController, 'scoutByDiscord'])
```

- [ ] **Step 4: Add the controller action**

In `app/controllers/lol_controller.ts`, ensure these imports exist:

```ts
import LiveScoutService from '#services/live_scout_service'
```

Add inside `LolController`:

```ts
  async scoutByDiscord({ params, response }: HttpContext) {
    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      return response.status(404).json({ error: 'not_linked' })
    }
    const riot = new RiotApiService('euw1')
    let active
    try {
      active = await riot.getActiveGameByPuuid(user.riotPuuid)
    } catch (err) {
      if (err instanceof RiotApiError && err.statusCode === 404) {
        return response.status(404).json({ error: 'not_in_game' })
      }
      throw err
    }

    // Build a championId → championName map from Data Dragon (cached).
    const champions = await riot.getAllChampions()
    const championNameById: Record<number, string> = {}
    for (const c of Object.values(champions) as any[]) {
      championNameById[parseInt(c.key, 10)] = c.name
    }

    const result = await LiveScoutService.enrich(riot, active, user.riotPuuid, championNameById)
    return response.json(result)
  }
```

- [ ] **Step 5: Run tests + typecheck + commit**

```bash
pnpm test --filter "GET /lol/scout"
pnpm typecheck
```

Expected: 3 tests pass.

```bash
git add app/controllers/lol_controller.ts start/routes.ts tests/functional/lol_scout.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): add GET /lol/scout/by-discord/:id endpoint

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10 — `/live` slash command (bot)

**Files:**
- Modify: `Discord/Commands/api_beemo.py`
- Modify: `Discord/Commands/embed_factory.py`
- Create: `Discord/Commands/live.py`
- Modify: `Discord/Commands/global_commands.py`

- [ ] **Step 1: Add API wrapper**

In `Discord/Commands/api_beemo.py`:

```python
async def get_scout(discord_id: str):
    return await _request("GET", f"/lol/scout/by-discord/{discord_id}")
```

- [ ] **Step 2: Add embed factory**

In `Discord/Commands/embed_factory.py`:

```python
def embed_scout(data: dict) -> discord.Embed:
    """Embed for /live — full scout of the current game."""
    win_pct = data.get("predictionWinPct", 50)
    color = 0xE74C3C  # red since user is in a tense moment

    self_team = str(data.get("self", {}).get("teamId", 100))
    other_team = "200" if self_team == "100" else "100"
    teams = data.get("teams", {})

    embed = discord.Embed(
        title=f"🔴 Game détectée — {data.get('queueType', '?')}",
        description=f"**Prédiction** : `{win_pct}%` win",
        color=color,
    )

    embed.add_field(
        name="🟦 Ton équipe",
        value=_format_team(teams.get(self_team, [])),
        inline=False,
    )
    embed.add_field(
        name="🟥 Adverse",
        value=_format_team(teams.get(other_team, [])),
        inline=False,
    )

    threats = data.get("topThreats", [])
    if threats:
        threat_text = "\n".join(f"⚠️ **{t['championName']}** — {t['reason']}" for t in threats)
        embed.add_field(name="🎯 Threats", value=threat_text, inline=False)

    elapsed_min = data.get("gameLength", 0) // 60
    embed.set_footer(text=f"Game {data.get('gameId', '?')} · {elapsed_min} min écoulées")
    return embed


def _format_team(participants: list) -> str:
    if not participants:
        return "_(aucun joueur)_"
    lines = []
    for p in participants:
        rank = p.get("rank")
        rank_str = f"{rank['tier'].title()} {rank['rank']}" if rank else "Unranked"
        cs = p.get("championStats", {})
        wr_str = f"{cs.get('winPct', 0)}% WR sur {cs.get('games', 0)}g" if cs.get("games", 0) >= 1 else ""
        line = f"**{p.get('championName', '?')}** — {rank_str}"
        if wr_str:
            line += f" · {wr_str}"
        lines.append(line)
    return "\n".join(lines)
```

- [ ] **Step 3: Create the slash command**

Create `Discord/Commands/live.py`:

```python
# Last updated: 2026-05-07
import discord
from Discord.Commands.api_beemo import get_scout
from Discord.Commands.embed_factory import embed_scout


def register_live(bot):
    @bot.tree.command(name="live", description="Scout ta game en cours")
    async def live_cmd(interaction: discord.Interaction):
        await interaction.response.defer(ephemeral=True, thinking=True)
        data = await get_scout(str(interaction.user.id))

        if data is None:
            return await interaction.followup.send(
                "⚠️ Erreur API — réessaie dans quelques secondes.", ephemeral=True
            )
        if data.get("error") == "not_linked":
            return await interaction.followup.send(
                "❌ Lie ton compte d'abord avec `/link`.", ephemeral=True
            )
        if data.get("error") == "not_in_game":
            return await interaction.followup.send(
                "❌ Tu n'es pas en game actuellement.", ephemeral=True
            )

        await interaction.followup.send(embed=embed_scout(data), ephemeral=True)
```

- [ ] **Step 4: Register**

In `Discord/Commands/global_commands.py`:

```python
from Discord.Commands.live import register_live
```

Inside `register_global_commands(bot)`:

```python
register_live(bot)
```

- [ ] **Step 5: Commit**

```bash
cd /Users/jeremy/Documents/Code/ynov/ydays/bot
git add Discord/Commands/api_beemo.py Discord/Commands/embed_factory.py Discord/Commands/live.py Discord/Commands/global_commands.py
git commit -m "$(cat <<'EOF'
feat(bot): add /live slash command for in-game scouting

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11 — Anti-flood per discordId (15s cache)

**Files:**
- Modify: `app/controllers/lol_controller.ts`
- Modify: `tests/functional/lol_scout.spec.ts` (add a test)

The 3 endpoints can be expensive (especially `/scout` ≈ 30 Riot calls). If a user double-taps `/live`, we should serve the cached response without re-hitting Riot.

- [ ] **Step 1: Write the failing test**

Append to `tests/functional/lol_scout.spec.ts`:

```ts
test('serves cached response if same discordId calls within 15s', async ({ client, assert }) => {
  await User.create({
    discordId: 'D_FLOOD', username: 'u',
    riotPuuid: 'P_S', riotGameName: 'Nunch', riotTagLine: 'N7789',
    linkedAt: DateTime.now(),
  })
  let calls = 0
  // @ts-expect-error monkey-patch
  RiotApiService.prototype.makeRequest = async (url: string) => {
    calls++
    if (url.includes('/lol/spectator/v5/active-games')) {
      return {
        gameId: 1, gameStartTime: 0, gameLength: 60,
        gameMode: 'CLASSIC', gameType: 'MATCHED_GAME',
        gameQueueConfigId: 420, mapId: 11,
        participants: [
          { puuid: 'P_S', championId: 222, teamId: 100, summonerId: 'S1', spell1Id: 4, spell2Id: 7, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
        ],
        bannedChampions: [],
      }
    }
    if (url.includes('/lol/league/v4')) return []
    if (url.includes('/lol/champion-mastery/v4')) return []
    if (url.includes('/lol/match/v5/matches/by-puuid')) return []
    if (url.includes('champion.json')) return { data: { Jinx: { key: '222', name: 'Jinx' } } }
    if (url.includes('versions.json')) return ['14.1.1']
    return null
  }

  await client.get('/lol/scout/by-discord/D_FLOOD')
  const callsAfterFirst = calls
  await client.get('/lol/scout/by-discord/D_FLOOD')
  assert.equal(calls, callsAfterFirst, 'second call should hit the anti-flood cache')
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test --filter "anti-flood"
```

Expected: FAIL — `calls` increases on the second request.

- [ ] **Step 3: Implement an in-memory cache**

In `app/controllers/lol_controller.ts`, at the top (above the class):

```ts
// Anti-flood cache: serve the same payload to the same discordId within 15s
// to avoid re-hitting Riot if a user double-taps a command.
const FLOOD_TTL_MS = 15_000
const floodCache = new Map<string, { ts: number; payload: unknown; status: number }>()

function floodGet(key: string): { payload: unknown; status: number } | null {
  const entry = floodCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > FLOOD_TTL_MS) {
    floodCache.delete(key)
    return null
  }
  return { payload: entry.payload, status: entry.status }
}

function floodSet(key: string, payload: unknown, status: number) {
  floodCache.set(key, { ts: Date.now(), payload, status })
}
```

Wrap each of the 3 actions with the cache. For `scoutByDiscord`:

```ts
  async scoutByDiscord({ params, response }: HttpContext) {
    const cacheKey = `scout:${params.id}`
    const cached = floodGet(cacheKey)
    if (cached) {
      return response.status(cached.status).json(cached.payload)
    }

    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      const payload = { error: 'not_linked' }
      floodSet(cacheKey, payload, 404)
      return response.status(404).json(payload)
    }
    const riot = new RiotApiService('euw1')
    let active
    try {
      active = await riot.getActiveGameByPuuid(user.riotPuuid)
    } catch (err) {
      if (err instanceof RiotApiError && err.statusCode === 404) {
        const payload = { error: 'not_in_game' }
        floodSet(cacheKey, payload, 404)
        return response.status(404).json(payload)
      }
      throw err
    }

    const champions = await riot.getAllChampions()
    const championNameById: Record<number, string> = {}
    for (const c of Object.values(champions) as any[]) {
      championNameById[parseInt(c.key, 10)] = c.name
    }

    const result = await LiveScoutService.enrich(riot, active, user.riotPuuid, championNameById)
    floodSet(cacheKey, result, 200)
    return response.json(result)
  }
```

For `predictByDiscord`, replace the existing implementation with:

```ts
  async predictByDiscord({ params, response }: HttpContext) {
    const cacheKey = `predict:${params.id}`
    const cached = floodGet(cacheKey)
    if (cached) {
      return response.status(cached.status).json(cached.payload)
    }

    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      const payload = { error: 'not_linked' }
      floodSet(cacheKey, payload, 404)
      return response.status(404).json(payload)
    }
    const riot = new RiotApiService('euw1')
    let active
    try {
      active = await riot.getActiveGameByPuuid(user.riotPuuid)
    } catch (err) {
      if (err instanceof RiotApiError && err.statusCode === 404) {
        const payload = { error: 'not_in_game' }
        floodSet(cacheKey, payload, 404)
        return response.status(404).json(payload)
      }
      throw err
    }

    const ranks = await Promise.all(
      active.participants.map(async (p) => {
        try {
          const entries = await riot.getSummonerRank(p.puuid)
          const solo = entries.find((e: any) => e.queueType === 'RANKED_SOLO_5x5') ?? entries[0] ?? null
          return { puuid: p.puuid, teamId: p.teamId, rank: solo }
        } catch {
          return { puuid: p.puuid, teamId: p.teamId, rank: null }
        }
      })
    )

    const scoresByTeam: Record<number, number[]> = { 100: [], 200: [] }
    for (const r of ranks) {
      const s = PredictService.rankScore(
        r.rank
          ? { tier: r.rank.tier, division: r.rank.rank, hotStreak: r.rank.hotStreak, masteryPoints: 0 }
          : null
      )
      scoresByTeam[r.teamId].push(s)
    }

    const avg100 = scoresByTeam[100].length
      ? Math.round((scoresByTeam[100].reduce((a, b) => a + b, 0) / scoresByTeam[100].length) * 10) / 10
      : 0
    const avg200 = scoresByTeam[200].length
      ? Math.round((scoresByTeam[200].reduce((a, b) => a + b, 0) / scoresByTeam[200].length) * 10) / 10
      : 0

    const selfTeam = active.participants.find((p) => p.puuid === user.riotPuuid)?.teamId ?? 100
    const myAvg = selfTeam === 100 ? avg100 : avg200
    const oppAvg = selfTeam === 100 ? avg200 : avg100
    const diff = Math.round((myAvg - oppAvg) * 10) / 10

    const payload = {
      gameId: String(active.gameId),
      self: { teamId: selfTeam },
      teamScores: { '100': avg100, '200': avg200 },
      diff,
      winPct: PredictService.predictWinPct(myAvg, oppAvg),
      explanation: PredictService.explain(diff),
    }
    floodSet(cacheKey, payload, 200)
    return response.json(payload)
  }
```

For `debriefByDiscord`, replace the existing implementation with:

```ts
  async debriefByDiscord({ params, response }: HttpContext) {
    const cacheKey = `debrief:${params.id}`
    const cached = floodGet(cacheKey)
    if (cached) {
      return response.status(cached.status).json(cached.payload)
    }

    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      const payload = { error: 'not_linked' }
      floodSet(cacheKey, payload, 404)
      return response.status(404).json(payload)
    }
    const riot = new RiotApiService('euw1')
    const matchIds = await riot.getMatchHistory(user.riotPuuid, 'europe', 0, 1)
    if (matchIds.length === 0) {
      const payload = { error: 'no_recent_match' }
      floodSet(cacheKey, payload, 404)
      return response.status(404).json(payload)
    }
    const matchId = matchIds[0]
    const match = await riot.getMatchDetails(matchId, 'europe')
    const participant = match.info.participants.find((p: any) => p.puuid === user.riotPuuid)
    if (!participant) {
      const payload = { error: 'no_recent_match' }
      floodSet(cacheKey, payload, 404)
      return response.status(404).json(payload)
    }
    const queueType = mapQueueId(match.info.queueId)
    const result = DebriefService.analyze(participant, matchId, match.info.gameDuration, queueType)
    floodSet(cacheKey, result, 200)
    return response.json(result)
  }
```

Note: the previous (Task 3 / Task 6) versions of these methods get **replaced** entirely — don't keep both.

- [ ] **Step 4: Run tests + typecheck**

```bash
pnpm test --filter "anti-flood"
pnpm test  # full suite to make sure nothing else broke
pnpm typecheck
```

Expected: anti-flood test passes, full suite still green.

- [ ] **Step 5: Commit**

```bash
git add app/controllers/lol_controller.ts tests/functional/lol_scout.spec.ts
git commit -m "$(cat <<'EOF'
feat(api): anti-flood per-discord cache for /lol commands (15s)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12 — help.py update + final smoke test

**Files:**
- Modify: `Discord/Commands/help.py`

- [ ] **Step 1: Read current help.py and add 3 lines**

Open `Discord/Commands/help.py`. The file lists existing commands. Add right after the `/link` line:

```python
                "`/live` — Scout ta game en cours (rank, mastery, threats des adversaires)\n"
                "`/predict` — Prédiction win% basée sur les ranks de la game\n"
                "`/debrief` — Analyse heuristique de ta dernière game\n"
```

(Match the indentation and quoting style of the existing lines in `help.py`.)

- [ ] **Step 2: Commit help update**

```bash
cd /Users/jeremy/Documents/Code/ynov/ydays/bot
git add Discord/Commands/help.py
git commit -m "$(cat <<'EOF'
docs(bot): document /live, /predict, /debrief in /help_orion

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 3: Manual smoke test (no automated test framework on bot)**

Pre-requisites:
1. PostgreSQL up locally, schema migrated
2. Riot dev key valid (renewed within 24h on https://developer.riotgames.com/)
3. At least one user in DB with `discord_id` and `riot_puuid` linked
4. The linked Riot account is currently in a real game (or you have a friend who is)

Steps:

```bash
# Terminal 1 — start API
cd /Users/jeremy/Documents/Code/ynov/ydays/beemobot-api
pnpm dev

# Terminal 2 — start bot
cd /Users/jeremy/Documents/Code/ynov/ydays/bot
python main.py
```

In Discord:
- `/live` (while in a game) → expect rich embed with both teams, threats, prediction
- `/live` (not in a game) → "❌ Tu n'es pas en game actuellement"
- `/live` (with an unlinked Discord account) → "❌ Lie ton compte d'abord avec `/link`"
- `/predict` (while in a game) → win% embed
- `/debrief` (after at least one match exists) → debrief embed with 3 verdicts
- Re-tap `/live` within 15s → response is identical (anti-flood served)

If any case fails, the issue is most likely:
- Riot dev key expired (check API logs)
- DB connection (verify `pnpm dev` boots without error)
- Slash commands not synced (the bot calls `await bot.tree.sync()` at startup — if you added new commands, kill the bot and restart it)

- [ ] **Step 4: Commit any fixes if smoke test surfaced issues**

(No template — depends on what you find. If nothing breaks, no commit.)

---

## Self-review (run before declaring complete)

After all 12 tasks, run a final check:

```bash
cd /Users/jeremy/Documents/Code/ynov/ydays/beemobot-api
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all green.

Then verify the spec coverage:

| Spec section | Implemented in | ✓ |
|---|---|---|
| §4.1 `/live` endpoint + embed | Tasks 8, 9, 10 | |
| §4.2 `/predict` endpoint + embed | Tasks 5, 6, 7 | |
| §4.3 `/debrief` endpoint + embed | Tasks 2, 3, 4 | |
| §5 Spectator v5 method | Task 1 | |
| §7 Anti-flood 15s | Task 11 | |
| §8 Error matrix (not_linked, not_in_game, no_recent_match, riot_api_error) | Tasks 3, 6, 9 | |
| §9 Unit tests for predict/debrief/scout | Tasks 2, 5, 8 | |
| §9 Functional tests for the 3 endpoints | Tasks 3, 6, 9 | |
| §10 List of files impacted | All tasks | |

If any row is unchecked at the end, go back and fix.

---

## Definition of done

- All 12 tasks committed
- `pnpm test` green (≥ 25 tests passing across unit + functional)
- `pnpm typecheck` green
- Manual smoke test passed for all 3 commands × 3 cases (linked-in-game, linked-not-in-game, unlinked)
- `/help_orion` shows the 3 new commands
- No new file > 250 lines (unless justified)
- No `console.log` left over
