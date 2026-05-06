# BeemoBot Reputation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre BeemoBot autour d'un système de réputation peer-to-peer prouvé par les matchs Riot, avec économie honey, profil partageable et Hall of Fame mondial.

**Architecture:** AdonisJS API (source de vérité, Postgres + Lucid) consommée par un bot Discord Python (commandes + DM consumer + match worker proactif) et un webapp Next.js (profils publics + leaderboards + mini-jeux + shop cosmétiques). La rep est immuable, la honey est dérivée et dépensable.

**Tech Stack:**
- API : AdonisJS 6, Lucid, Postgres, vinejs, Japa (tests)
- Bot : Python 3.x, discord.py, aiohttp, riotwatcher
- Worker : Python 3.x (process séparé du bot, partage le code Python)
- Webapp : Next.js 15, React 19, TS, Tailwind, axios

---

## File Structure

### `beemobot-api`
```
app/
  controllers/
    auth_controller.ts                # MODIFY (Phase 1) : add link
    rep_controller.ts                 # CREATE (Phase 1)
    profile_controller.ts             # CREATE (Phase 1)
    economy_controller.ts             # CREATE (Phase 1, extend Phase 3)
    leaderboard_controller.ts         # CREATE (Phase 3)
    shop_controller.ts                # CREATE (Phase 3)
    admin_controller.ts               # CREATE (Phase 4)
  models/
    reputation_event.ts               # CREATE (Phase 1)
    honey_ledger_entry.ts             # CREATE (Phase 1)
    cosmetic.ts                       # CREATE (Phase 3)
    user_cosmetic.ts                  # CREATE (Phase 3)
  services/
    rep_service.ts                    # CREATE (Phase 1)
    honey_service.ts                  # CREATE (Phase 1)
    leaderboard_service.ts            # CREATE (Phase 3)
    cache.ts                          # CREATE (Phase 4)
  validators/
    auth.ts                           # CREATE (Phase 1)
    rep.ts                            # CREATE (Phase 1)
    economy.ts                        # CREATE (Phase 3)
    shop.ts                           # CREATE (Phase 3)
database/migrations/
  *_drop_legacy_game_tables.ts        # CREATE (Phase 1)
  *_extend_users_for_rep.ts           # CREATE (Phase 1)
  *_create_reputation_events.ts       # CREATE (Phase 1)
  *_create_honey_ledger.ts            # CREATE (Phase 1)
  *_create_match_poll_state.ts        # CREATE (Phase 1, used Phase 2)
  *_create_dm_queue.ts                # CREATE (Phase 2)
  *_create_cosmetics.ts               # CREATE (Phase 3)
tests/functional/
  rep_give.spec.ts                    # CREATE (Phase 1)
  profile.spec.ts                     # CREATE (Phase 1)
  leaderboard.spec.ts                 # CREATE (Phase 3)
```

### `bot` (Python)
```
config.py                             # MODIFY : add WEBAPP_URL
Discord/Commands/
  link.py                             # CREATE (Phase 1)
  me.py                               # CREATE (Phase 1)
  judge.py                            # CREATE (Phase 1)
  global_commands.py                  # MODIFY : remove /shroom /respect
  api_beemo.py                        # MODIFY : repoint on /rep/give /profile /economy
  rep_buttons.py                      # CREATE (Phase 2) discord.ui.View
  setup_admin.py                      # CREATE (Phase 4)
worker/                               # NEW DIR (Phase 2)
  __init__.py
  main.py                             # CREATE (Phase 2)
  riot_poller.py                      # CREATE (Phase 2)
  rate_limiter.py                     # CREATE (Phase 2)
  dm_dispatcher.py                    # CREATE (Phase 2, used by bot)
```

### `beemobot-webapp`
```
src/app/
  auth/link/page.tsx                  # CREATE (Phase 1)
  auth/callback/page.tsx              # MODIFY : redirect to /auth/link if no riot_puuid
  u/[riotId]/page.tsx                 # CREATE (Phase 1, extend Phase 3)
  leaderboard/page.tsx                # CREATE (Phase 3)
  shop/page.tsx                       # CREATE (Phase 3)
  games/page.tsx                      # CREATE (Phase 3) — wraps existing 5 minigames
src/components/organisms/
  RepEvent.tsx                        # CREATE (Phase 1)
  LeaderboardTable.tsx                # CREATE (Phase 3)
  CosmeticCard.tsx                    # CREATE (Phase 3)
  BetModal.tsx                        # CREATE (Phase 3)
src/lib/
  api.ts                              # CREATE : centralized API client
  env.ts                              # MODIFY : add NEXT_PUBLIC_DISCORD_OAUTH_URL
```

---

# Phase 1 — MVP Réactif (semaines 1-3)

**Definition of Done :** Deux utilisateurs peuvent se shroomer mutuellement après une vraie game LoL, via la commande `/judge` sur Discord. Le webapp affiche leurs profils publics avec rep + honey.

---

### Task 1.1 — Drop legacy game tables

**Files:**
- Create: `database/migrations/1746500000000_drop_legacy_game_tables.ts`

- [ ] **Step 1: Créer la migration de drop**

Run: `cd beemobot-api && node ace make:migration drop_legacy_game_tables`

- [ ] **Step 2: Remplacer le contenu**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('shrooms')
    this.schema.dropTableIfExists('respects')
    this.schema.dropTableIfExists('reports') // unused
    this.schema.dropTableIfExists('champions') // unused
  }

  async down() {
    // Pas de rollback : on ne reconstruit pas les tables legacy.
  }
}
```

- [ ] **Step 3: Run + verify**

Run: `node ace migration:run`
Expected: les 4 tables sont supprimées sans erreur.

- [ ] **Step 4: Supprimer les modèles obsolètes**

```bash
rm app/models/shroom.ts app/models/respect.ts
```

- [ ] **Step 5: Commit**

```bash
git add database/migrations app/models
git commit -m "chore(api): drop legacy shrooms/respects/reports/champions tables"
```

---

### Task 1.2 — Extend `users` table

**Files:**
- Create: `database/migrations/1746500001000_extend_users_for_rep.ts`

- [ ] **Step 1: Make migration**

Run: `node ace make:migration extend_users_for_rep --table=users`

- [ ] **Step 2: Replace content**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.timestamp('linked_at', { useTz: true }).nullable()
      table.date('last_daily_at').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('linked_at')
      table.dropColumn('last_daily_at')
    })
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
node ace migration:run
git add database/migrations
git commit -m "feat(api): add linked_at + last_daily_at to users"
```

---

### Task 1.3 — Create `reputation_events` table

**Files:**
- Create: `database/migrations/1746500002000_create_reputation_events.ts`

- [ ] **Step 1: Make migration**

Run: `node ace make:migration create_reputation_events`

- [ ] **Step 2: Content**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reputation_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('type', 10).notNullable()
      table.string('giver_puuid', 128).notNullable()
      table.string('receiver_puuid', 128).notNullable()
      table.string('guild_id', 32).nullable()
      table.string('match_id', 64).notNullable()
      table.decimal('weight', 3, 2).notNullable().defaultTo(1.0)
      table.text('reason').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['giver_puuid', 'receiver_puuid', 'match_id', 'type'])
      table.index(['receiver_puuid', 'type'])
      table.index(['guild_id', 'created_at'])
      table.index('created_at')
    })

    this.schema.raw(
      `ALTER TABLE reputation_events ADD CONSTRAINT type_valid CHECK (type IN ('shroom','respect'))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

- [ ] **Step 3: Run + commit**

```bash
node ace migration:run
git add database/migrations
git commit -m "feat(api): create reputation_events table"
```

---

### Task 1.4 — Create `honey_ledger` table

**Files:**
- Create: `database/migrations/1746500003000_create_honey_ledger.ts`

- [ ] **Step 1: Make + content**

```bash
node ace make:migration create_honey_ledger
```

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'honey_ledger'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('user_puuid', 128).notNullable()
      table.integer('delta').notNullable()
      table.string('reason', 50).notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.index(['user_puuid', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
node ace migration:run
git add database/migrations
git commit -m "feat(api): create honey_ledger append-only table"
```

---

### Task 1.5 — Create `match_poll_state` (used in Phase 2 but created now)

**Files:**
- Create: `database/migrations/1746500004000_create_match_poll_state.ts`

- [ ] **Step 1: Make + content**

```bash
node ace make:migration create_match_poll_state
```

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'match_poll_state'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('user_puuid', 128).primary()
      table.string('last_polled_match_id', 64).nullable()
      table.timestamp('last_polled_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
node ace migration:run
git add database/migrations
git commit -m "feat(api): create match_poll_state for the future worker"
```

---

### Task 1.6 — Model `ReputationEvent`

**Files:**
- Create: `app/models/reputation_event.ts`

- [ ] **Step 1: Create**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type RepType = 'shroom' | 'respect'

export default class ReputationEvent extends BaseModel {
  static table = 'reputation_events'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare type: RepType

  @column()
  declare giverPuuid: string

  @column()
  declare receiverPuuid: string

  @column()
  declare guildId: string | null

  @column()
  declare matchId: string

  @column()
  declare weight: number

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
```

- [ ] **Step 2: Commit**

```bash
git add app/models/reputation_event.ts
git commit -m "feat(api): add ReputationEvent model"
```

---

### Task 1.7 — Model `HoneyLedgerEntry`

**Files:**
- Create: `app/models/honey_ledger_entry.ts`

- [ ] **Step 1: Create**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type HoneyReason =
  | 'respect_received'
  | 'shroom_received'
  | 'daily_login'
  | 'minigame_win'
  | 'minigame_bet'
  | 'cosmetic_purchase'

export default class HoneyLedgerEntry extends BaseModel {
  static table = 'honey_ledger'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userPuuid: string

  @column()
  declare delta: number

  @column()
  declare reason: HoneyReason

  @column({
    prepare: (v) => (v == null ? null : JSON.stringify(v)),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  })
  declare metadata: Record<string, any> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
```

- [ ] **Step 2: Commit**

```bash
git add app/models/honey_ledger_entry.ts
git commit -m "feat(api): add HoneyLedgerEntry model"
```

---

### Task 1.8 — Service `HoneyService`

**Files:**
- Create: `app/services/honey_service.ts`
- Test: `tests/functional/honey_service.spec.ts`

- [ ] **Step 1: Write test first**

Run: `node ace make:test honey_service --suite=functional`

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import HoneyService from '#services/honey_service'

test.group('HoneyService', (group) => {
  group.each.setup(async () => {
    await HoneyLedgerEntry.truncate(true)
  })

  test('credit appends a positive entry', async ({ assert }) => {
    await HoneyService.credit('puuid-1', 10, 'respect_received', { match_id: 'EUW1_1' })
    const entries = await HoneyLedgerEntry.query().where('userPuuid', 'puuid-1')
    assert.lengthOf(entries, 1)
    assert.equal(entries[0].delta, 10)
  })

  test('balance sums all deltas', async ({ assert }) => {
    await HoneyService.credit('puuid-1', 10, 'respect_received')
    await HoneyService.credit('puuid-1', 5, 'shroom_received')
    await HoneyService.debit('puuid-1', 3, 'minigame_bet')
    const balance = await HoneyService.balance('puuid-1')
    assert.equal(balance, 12)
  })

  test('debit fails on insufficient balance', async ({ assert }) => {
    await HoneyService.credit('puuid-1', 5, 'respect_received')
    await assert.rejects(() => HoneyService.debit('puuid-1', 10, 'minigame_bet'))
  })
})
```

- [ ] **Step 2: Run test, expect failure**

Run: `node ace test functional --files honey_service`
Expected: import error / module not found.

- [ ] **Step 3: Implement service**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import HoneyLedgerEntry, { HoneyReason } from '#models/honey_ledger_entry'
import db from '@adonisjs/lucid/services/db'

export default class HoneyService {
  static async credit(
    userPuuid: string,
    amount: number,
    reason: HoneyReason,
    metadata: Record<string, any> | null = null
  ) {
    if (amount <= 0) throw new Error('credit amount must be positive')
    return HoneyLedgerEntry.create({ userPuuid, delta: amount, reason, metadata })
  }

  static async debit(
    userPuuid: string,
    amount: number,
    reason: HoneyReason,
    metadata: Record<string, any> | null = null
  ) {
    if (amount <= 0) throw new Error('debit amount must be positive')
    return db.transaction(async (trx) => {
      const balance = await this.balance(userPuuid, trx)
      if (balance < amount) throw new Error('insufficient_honey')
      return HoneyLedgerEntry.create(
        { userPuuid, delta: -amount, reason, metadata },
        { client: trx }
      )
    })
  }

  static async balance(userPuuid: string, trx?: any): Promise<number> {
    const query = HoneyLedgerEntry.query({ client: trx })
      .where('userPuuid', userPuuid)
      .sum('delta as total')
    const row = await query
    return Number(row[0].$extras.total ?? 0)
  }
}
```

- [ ] **Step 4: Run test, expect pass**

Run: `node ace test functional --files honey_service`
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add app/services/honey_service.ts tests/functional/honey_service.spec.ts
git commit -m "feat(api): add HoneyService with credit/debit/balance"
```

---

### Task 1.9 — Service `RepService` (giveRep + computeWeight + listEligibleMatches)

**Files:**
- Create: `app/services/rep_service.ts`
- Test: `tests/functional/rep_service.spec.ts`

- [ ] **Step 1: Write tests**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import ReputationEvent from '#models/reputation_event'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import RepService from '#services/rep_service'

test.group('RepService.computeWeight', () => {
  test('weight is 1.0 for new user (no rep)', async ({ assert }) => {
    const w = await RepService.computeWeight('new-puuid')
    assert.equal(w, 1.0)
  })

  test('weight scales linearly to max 2.0 at net_rep=50', async ({ assert }) => {
    await ReputationEvent.create({
      type: 'respect',
      giverPuuid: 'other',
      receiverPuuid: 'p',
      matchId: 'EUW1_1',
      weight: 1.0,
    })
    const w = await RepService.computeWeight('p')
    assert.closeTo(w, 1.02, 0.01) // 1 respect = +0.02
  })

  test('weight does not go below 1.0 with negative net rep', async ({ assert }) => {
    await ReputationEvent.create({
      type: 'shroom',
      giverPuuid: 'other',
      receiverPuuid: 'p',
      matchId: 'EUW1_1',
      weight: 1.0,
    })
    const w = await RepService.computeWeight('p')
    assert.equal(w, 1.0)
  })
})

test.group('RepService.giveRep', (group) => {
  group.each.setup(async () => {
    await ReputationEvent.truncate(true)
    await HoneyLedgerEntry.truncate(true)
  })

  test('creates event + credits honey', async ({ assert }) => {
    const event = await RepService.giveRep({
      giverPuuid: 'g1',
      receiverPuuid: 'r1',
      matchId: 'EUW1_1',
      type: 'respect',
      guildId: '12345',
    })
    assert.exists(event.id)
    assert.equal(event.weight, 1.0)
    const honey = await HoneyLedgerEntry.findBy('userPuuid', 'r1')
    assert.equal(honey?.delta, 10)
  })

  test('throws on duplicate (same giver, receiver, match, type)', async ({ assert }) => {
    await RepService.giveRep({
      giverPuuid: 'g1',
      receiverPuuid: 'r1',
      matchId: 'EUW1_1',
      type: 'respect',
    })
    await assert.rejects(() =>
      RepService.giveRep({
        giverPuuid: 'g1',
        receiverPuuid: 'r1',
        matchId: 'EUW1_1',
        type: 'respect',
      })
    )
  })
})
```

- [ ] **Step 2: Implement**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import ReputationEvent, { RepType } from '#models/reputation_event'
import HoneyService from '#services/honey_service'
import RiotApiService, { RiotPlatform } from '#services/riot_api_service'
import db from '@adonisjs/lucid/services/db'

const HONEY_PER_RESPECT = 10
const HONEY_PER_SHROOM = 5
const WEIGHT_MAX_NET_REP = 50

export interface GiveRepInput {
  giverPuuid: string
  receiverPuuid: string
  matchId: string
  type: RepType
  guildId?: string | null
  reason?: string | null
}

export default class RepService {
  static async computeWeight(giverPuuid: string): Promise<number> {
    const rows = await db
      .from('reputation_events')
      .where('receiverPuuid', giverPuuid)
      .select(db.raw(`type, COUNT(*) as cnt`))
      .groupBy('type')

    let respects = 0
    let shrooms = 0
    for (const row of rows) {
      if (row.type === 'respect') respects = Number(row.cnt)
      if (row.type === 'shroom') shrooms = Number(row.cnt)
    }
    const netRep = Math.max(0, respects - shrooms)
    return Math.round((1 + Math.min(1, netRep / WEIGHT_MAX_NET_REP)) * 100) / 100
  }

  static async giveRep(input: GiveRepInput) {
    const weight = await this.computeWeight(input.giverPuuid)

    return db.transaction(async (trx) => {
      const event = await ReputationEvent.create(
        {
          type: input.type,
          giverPuuid: input.giverPuuid,
          receiverPuuid: input.receiverPuuid,
          matchId: input.matchId,
          guildId: input.guildId ?? null,
          reason: input.reason ?? null,
          weight,
        },
        { client: trx }
      )

      const honeyDelta = input.type === 'respect' ? HONEY_PER_RESPECT : HONEY_PER_SHROOM
      const honeyReason = input.type === 'respect' ? 'respect_received' : 'shroom_received'
      await HoneyService.credit(input.receiverPuuid, honeyDelta, honeyReason, {
        match_id: input.matchId,
        rep_event_id: event.id,
      })

      return event
    })
  }

  /**
   * Returns match IDs where giver and receiver are both present AND
   * (type='shroom' or type='respect') has not yet been used.
   */
  static async listEligibleMatches(
    giverPuuid: string,
    receiverPuuid: string,
    region: RiotPlatform = 'europe'
  ): Promise<{ matchId: string; canShroom: boolean; canRespect: boolean }[]> {
    const riot = new RiotApiService()
    const matches = await riot.getMatchHistory(giverPuuid, region, 0, 20)

    const results = []
    for (const matchId of matches) {
      const details = await riot.getMatchDetails(matchId, region)
      const participants = details.info.participants.map((p: any) => p.puuid)
      if (!participants.includes(receiverPuuid)) continue

      const used = await db
        .from('reputation_events')
        .where({ giverPuuid, receiverPuuid, matchId })
        .select('type')
      const usedTypes = new Set(used.map((u) => u.type))

      results.push({
        matchId,
        canShroom: !usedTypes.has('shroom'),
        canRespect: !usedTypes.has('respect'),
      })
    }
    return results
  }
}
```

- [ ] **Step 3: Run tests**

Run: `node ace test functional --files rep_service`
Expected: 5 passing.

- [ ] **Step 4: Commit**

```bash
git add app/services/rep_service.ts tests/functional/rep_service.spec.ts
git commit -m "feat(api): add RepService (give + weight + eligible matches)"
```

---

### Task 1.10 — Validators

**Files:**
- Create: `app/validators/auth.ts`
- Create: `app/validators/rep.ts`
- Modify: `app/validators/game.ts` → DELETE (legacy)

- [ ] **Step 1: Delete obsolete**

```bash
rm app/validators/game.ts
```

- [ ] **Step 2: Create `auth.ts`**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const linkRiotValidator = vine.compile(
  vine.object({
    gameName: vine.string().trim().minLength(1).maxLength(32),
    tagLine: vine.string().trim().minLength(1).maxLength(8),
    region: vine.enum([
      'euw1',
      'eun1',
      'na1',
      'br1',
      'jp1',
      'kr',
      'la1',
      'la2',
      'oc1',
      'tr1',
      'ru',
    ]),
  })
)
```

- [ ] **Step 3: Create `rep.ts`**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const giveRepValidator = vine.compile(
  vine.object({
    giverDiscordId: vine.string().trim().minLength(1).maxLength(32),
    receiverPuuid: vine.string().trim().minLength(40).maxLength(128),
    matchId: vine.string().trim().minLength(5).maxLength(64),
    type: vine.enum(['shroom', 'respect']),
    guildId: vine.string().trim().minLength(1).maxLength(32).optional(),
    reason: vine.string().trim().maxLength(200).optional(),
  })
)

export const eligibleQueryValidator = vine.compile(
  vine.object({
    giverPuuid: vine.string().trim().minLength(40).maxLength(128),
    receiverPuuid: vine.string().trim().minLength(40).maxLength(128),
    region: vine
      .enum(['europe', 'americas', 'asia', 'sea'])
      .optional(),
  })
)
```

- [ ] **Step 4: Commit**

```bash
git add app/validators
git commit -m "feat(api): add auth + rep validators"
```

---

### Task 1.11 — Endpoint `POST /auth/link`

**Files:**
- Modify: `app/controllers/auth_controller.ts`
- Modify: `app/services/auth_service.ts`
- Modify: `start/routes.ts`

- [ ] **Step 1: Extend `auth_service.ts` with `linkRiot`**

Add to `AuthService` class:

```ts
public async linkRiotAccount({
  request,
  response,
  auth,
}: HttpContext) {
  const payload = await request.validateUsing(linkRiotValidator)
  const user = auth.user
  if (!user) {
    return response.status(401).json({ error: 'unauthenticated' })
  }
  const riot = new RiotApiService(payload.region)
  const account = await riot.getAccountByRiotId(payload.gameName, payload.tagLine)

  user.riotPuuid = account.puuid
  user.riotGameName = account.gameName
  user.riotTagLine = account.tagLine
  user.linkedAt = DateTime.now()
  await user.save()

  return response.json({
    puuid: account.puuid,
    gameName: account.gameName,
    tagLine: account.tagLine,
  })
}
```

Add imports at top of file:
```ts
import { linkRiotValidator } from '#validators/auth'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'
```

- [ ] **Step 2: Add controller method**

In `auth_controller.ts`, add :

```ts
public async linkRiot(ctx: HttpContext) {
  // @ts-ignore
  return await this.authService.linkRiotAccount(ctx)
}
```

- [ ] **Step 3: Register route**

In `start/routes.ts`, add :

```ts
router.post('/auth/link', [AuthController, 'linkRiot']).use(middleware.auth())
```

- [ ] **Step 4: Add `linkedAt` column to User model**

In `app/models/user.ts`, add :

```ts
@column.dateTime()
declare linkedAt: DateTime | null

@column()
declare lastDailyAt: DateTime | null
```

- [ ] **Step 5: Smoke test**

```bash
# Generate a token first via /auth/discord/redirect, then :
TOKEN=...
curl -X POST http://localhost:3333/auth/link \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"gameName":"Nunch","tagLine":"N7789","region":"euw1"}'
```

Expected: `{"puuid":"...","gameName":"Nunch","tagLine":"N7789"}`

- [ ] **Step 6: Commit**

```bash
git add app/controllers app/services app/models start/routes.ts
git commit -m "feat(api): add POST /auth/link to attach Riot to authenticated user"
```

---

### Task 1.12 — Endpoint `GET /rep/eligible`

**Files:**
- Create: `app/controllers/rep_controller.ts`
- Modify: `start/routes.ts`

- [ ] **Step 1: Create controller**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import { eligibleQueryValidator, giveRepValidator } from '#validators/rep'
import RepService from '#services/rep_service'
import User from '#models/user'

export default class RepController {
  async eligible({ request, response }: HttpContext) {
    const qs = await eligibleQueryValidator.validate(request.qs())
    try {
      const matches = await RepService.listEligibleMatches(
        qs.giverPuuid,
        qs.receiverPuuid,
        qs.region
      )
      return response.json({ matches })
    } catch (error) {
      return response.status(502).json({ error: 'riot_api_unavailable' })
    }
  }

  async give({ request, response }: HttpContext) {
    const payload = await request.validateUsing(giveRepValidator)
    const giver = await User.findBy('discordId', payload.giverDiscordId)
    if (!giver?.riotPuuid || !giver.linkedAt) {
      return response.status(403).json({ error: 'giver_not_linked' })
    }
    try {
      const event = await RepService.giveRep({
        giverPuuid: giver.riotPuuid,
        receiverPuuid: payload.receiverPuuid,
        matchId: payload.matchId,
        type: payload.type,
        guildId: payload.guildId ?? null,
        reason: payload.reason ?? null,
      })
      return response.status(201).json({ id: event.id, weight: event.weight })
    } catch (error: any) {
      if (error.code === '23505') {
        return response.status(409).json({ error: 'already_given_for_this_match' })
      }
      throw error
    }
  }
}
```

- [ ] **Step 2: Register routes**

```ts
const RepController = () => import('#controllers/rep_controller')

router.get('/rep/eligible', [RepController, 'eligible'])
router.post('/rep/give', [RepController, 'give'])
```

- [ ] **Step 3: Smoke test eligible**

```bash
curl "http://localhost:3333/rep/eligible?giverPuuid=YOUR_PUUID&receiverPuuid=NUNCH_PUUID"
```

- [ ] **Step 4: Commit**

```bash
git add app/controllers/rep_controller.ts start/routes.ts
git commit -m "feat(api): add /rep/eligible and /rep/give endpoints"
```

---

### Task 1.13 — Functional test for `/rep/give`

**Files:**
- Create: `tests/functional/rep_give.spec.ts`

- [ ] **Step 1: Test**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import ReputationEvent from '#models/reputation_event'
import HoneyLedgerEntry from '#models/honey_ledger_entry'

test.group('POST /rep/give', (group) => {
  group.each.setup(async () => {
    await ReputationEvent.truncate(true)
    await HoneyLedgerEntry.truncate(true)
    await User.truncate(true)
  })

  test('rejects unlinked giver', async ({ client }) => {
    await User.create({
      discordId: 'd1',
      email: 'a@b.fr',
    })
    const response = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid: 'a'.repeat(78),
      matchId: 'EUW1_1',
      type: 'respect',
    })
    response.assertStatus(403)
  })

  test('returns 422 on invalid payload', async ({ client }) => {
    const response = await client.post('/rep/give').json({})
    response.assertStatus(422)
  })

  test('creates event and credits honey for linked giver', async ({ client, assert }) => {
    await User.create({
      discordId: 'd1',
      email: 'a@b.fr',
      riotPuuid: 'g'.repeat(78),
      linkedAt: new Date() as any,
    })
    const response = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid: 'r'.repeat(78),
      matchId: 'EUW1_1',
      type: 'respect',
    })
    response.assertStatus(201)
    const honey = await HoneyLedgerEntry.findBy('userPuuid', 'r'.repeat(78))
    assert.equal(honey?.delta, 10)
  })
})
```

- [ ] **Step 2: Run**

Run: `node ace test functional --files rep_give`
Expected: 3 passing.

- [ ] **Step 3: Commit**

```bash
git add tests/functional/rep_give.spec.ts
git commit -m "test(api): functional tests for /rep/give"
```

---

### Task 1.14 — Endpoint `GET /profile/:puuid`

**Files:**
- Create: `app/controllers/profile_controller.ts`
- Modify: `start/routes.ts`

- [ ] **Step 1: Create controller**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import HoneyService from '#services/honey_service'
import User from '#models/user'

export default class ProfileController {
  async show({ params, response }: HttpContext) {
    const puuid = params.puuid

    const counts = await db
      .from('reputation_events')
      .where('receiverPuuid', puuid)
      .select('type')
      .select(db.raw('COUNT(*) as cnt'))
      .select(db.raw('SUM(weight) as weighted'))
      .groupBy('type')

    let respects = 0
    let shrooms = 0
    let weightedRespects = 0
    let weightedShrooms = 0
    for (const row of counts) {
      if (row.type === 'respect') {
        respects = Number(row.cnt)
        weightedRespects = Number(row.weighted ?? 0)
      } else if (row.type === 'shroom') {
        shrooms = Number(row.cnt)
        weightedShrooms = Number(row.weighted ?? 0)
      }
    }

    const recentEvents = await db
      .from('reputation_events')
      .where('receiverPuuid', puuid)
      .orderBy('created_at', 'desc')
      .limit(20)

    const honey = await HoneyService.balance(puuid)

    const user = await User.findBy('riotPuuid', puuid)

    return response.json({
      puuid,
      gameName: user?.riotGameName ?? null,
      tagLine: user?.riotTagLine ?? null,
      linked: !!user?.linkedAt,
      counts: { respects, shrooms },
      weighted: { respects: weightedRespects, shrooms: weightedShrooms },
      honey,
      recentEvents,
    })
  }
}
```

- [ ] **Step 2: Route**

```ts
const ProfileController = () => import('#controllers/profile_controller')
router.get('/profile/:puuid', [ProfileController, 'show'])
```

- [ ] **Step 3: Smoke + commit**

```bash
curl http://localhost:3333/profile/SOMEPUUID
git add app/controllers/profile_controller.ts start/routes.ts
git commit -m "feat(api): add GET /profile/:puuid"
```

---

### Task 1.15 — Endpoint `GET /economy/balance`

**Files:**
- Create: `app/controllers/economy_controller.ts`
- Modify: `start/routes.ts`

- [ ] **Step 1: Controller**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import HoneyService from '#services/honey_service'

export default class EconomyController {
  async balance({ auth, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) {
      return response.status(409).json({ error: 'not_linked' })
    }
    const balance = await HoneyService.balance(user.riotPuuid)
    const recent = await HoneyLedgerEntry.query()
      .where('userPuuid', user.riotPuuid)
      .orderBy('createdAt', 'desc')
      .limit(20)
    return response.json({ balance, recent })
  }
}
```

- [ ] **Step 2: Route + commit**

```ts
const EconomyController = () => import('#controllers/economy_controller')
router.get('/economy/balance', [EconomyController, 'balance']).use(middleware.auth())
```

```bash
git add app/controllers/economy_controller.ts start/routes.ts
git commit -m "feat(api): add GET /economy/balance"
```

---

### Task 1.16 — Drop legacy `/game/*` routes from API

**Files:**
- Modify: `start/routes.ts`
- Delete: `app/controllers/game_controller.ts`

- [ ] **Step 1: Remove legacy refs**

In `start/routes.ts`, remove all `router.post('/game/*' ...)` and `router.get('/game/...)` lines, and the `GameController` import.

```bash
rm app/controllers/game_controller.ts
```

- [ ] **Step 2: Typecheck + commit**

Run: `pnpm typecheck`
Expected: clean.

```bash
git add start/routes.ts app/controllers
git commit -m "chore(api): drop legacy /game routes (replaced by /rep + /economy)"
```

---

### Task 1.17 — Webapp page `/auth/link`

**Files:**
- Create: `src/app/auth/link/page.tsx`
- Modify: `src/lib/env.ts` (already exists)

- [ ] **Step 1: Create page**

```tsx
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/env";
import Button from "@/components/atoms/Button";

const REGIONS = ["euw1", "eun1", "na1", "br1", "jp1", "kr", "la1", "la2", "oc1", "tr1", "ru"];
const TOKEN_KEY = "beemobot_token";

export default function LinkPage() {
  const router = useRouter();
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [region, setRegion] = useState("euw1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
      if (!token) throw new Error("Token Discord manquant. Reconnecte-toi.");

      const res = await fetch(`${API_URL}/auth/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gameName, tagLine, region }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Échec de la liaison.");
      }
      const data = await res.json();
      router.push(`/u/${data.gameName}-${data.tagLine}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-[#0f1117]">
      <form onSubmit={submit} className="bg-[#1a1d28] p-8 rounded-xl border border-gray-700/30 max-w-md w-full">
        <h1 className="text-2xl font-bold text-white mb-2">Lie ton compte Riot</h1>
        <p className="text-gray-400 mb-6">
          Une seule fois. Sans ça, tu ne peux pas donner de shrooms ou de respects.
        </p>
        <label className="block text-sm text-gray-300 mb-1">Game name</label>
        <input
          value={gameName}
          onChange={(e) => setGameName(e.target.value)}
          required
          className="w-full mb-4 px-3 py-2 bg-[#0f1117] border border-gray-700 rounded text-white"
        />
        <label className="block text-sm text-gray-300 mb-1">Tag line</label>
        <input
          value={tagLine}
          onChange={(e) => setTagLine(e.target.value)}
          required
          className="w-full mb-4 px-3 py-2 bg-[#0f1117] border border-gray-700 rounded text-white"
        />
        <label className="block text-sm text-gray-300 mb-1">Région</label>
        <select
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className="w-full mb-6 px-3 py-2 bg-[#0f1117] border border-gray-700 rounded text-white"
        >
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r.toUpperCase()}
            </option>
          ))}
        </select>
        {error && <p className="text-red-400 mb-4 text-sm">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700">
          {loading ? "Vérification..." : "Lier le compte"}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Smoke test in browser, commit**

Manual : `pnpm dev` puis ouvrir `/auth/link` après s'être loggé via Discord.

```bash
git add src/app/auth/link
git commit -m "feat(webapp): /auth/link page to attach Riot account"
```

---

### Task 1.18 — Webapp page `/u/[riotId]` (minimal)

**Files:**
- Create: `src/app/u/[riotId]/page.tsx`
- Create: `src/lib/api.ts`

- [ ] **Step 1: Create API client**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { API_URL } from "@/lib/env";

export interface Profile {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  linked: boolean;
  counts: { respects: number; shrooms: number };
  weighted: { respects: number; shrooms: number };
  honey: number;
  recentEvents: Array<{
    id: number;
    type: "shroom" | "respect";
    giver_puuid: string;
    match_id: string;
    weight: number;
    created_at: string;
  }>;
}

export async function fetchProfileByRiotId(gameName: string, tagLine: string): Promise<Profile | null> {
  const summoner = await fetch(
    `${API_URL}/lol/summoner/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`,
    { cache: "no-store" }
  );
  if (!summoner.ok) return null;
  const sum = await summoner.json();

  const profile = await fetch(`${API_URL}/profile/${sum.puuid}`, { cache: "no-store" });
  if (!profile.ok) return null;
  return profile.json();
}
```

- [ ] **Step 2: Create page**

```tsx
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { fetchProfileByRiotId } from "@/lib/api";
import { notFound } from "next/navigation";

interface Props {
  params: Promise<{ riotId: string }>;
}

export default async function ProfilePage({ params }: Props) {
  const { riotId } = await params;
  const decoded = decodeURIComponent(riotId);
  const sep = decoded.lastIndexOf("-");
  if (sep < 1) return notFound();
  const gameName = decoded.slice(0, sep);
  const tagLine = decoded.slice(sep + 1);

  const profile = await fetchProfileByRiotId(gameName, tagLine);
  if (!profile) return notFound();

  const netRep = profile.counts.respects - profile.counts.shrooms;

  return (
    <main className="min-h-screen bg-[#0f1117] py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-white">
            {profile.gameName}
            <span className="text-gray-500"> #{profile.tagLine}</span>
          </h1>
          {!profile.linked && (
            <p className="text-yellow-400 text-sm mt-2">
              ⚠️ Compte non lié — la rep s'accumule en attendant que ce joueur lie son Discord.
            </p>
          )}
        </header>

        <section className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-[#1a1d28] p-6 rounded-xl border border-gray-700/30 text-center">
            <p className="text-emerald-400 text-4xl font-bold">{profile.counts.respects}</p>
            <p className="text-gray-400 mt-1">Respects ⭐</p>
          </div>
          <div className="bg-[#1a1d28] p-6 rounded-xl border border-gray-700/30 text-center">
            <p className="text-orange-400 text-4xl font-bold">{profile.counts.shrooms}</p>
            <p className="text-gray-400 mt-1">Shrooms 🍄</p>
          </div>
          <div className="bg-[#1a1d28] p-6 rounded-xl border border-gray-700/30 text-center">
            <p className="text-yellow-300 text-4xl font-bold">{profile.honey}</p>
            <p className="text-gray-400 mt-1">Honey 🍯</p>
          </div>
        </section>

        <section className="bg-[#1a1d28] p-6 rounded-xl border border-gray-700/30">
          <h2 className="text-xl font-bold text-white mb-4">
            Score net : <span className={netRep >= 0 ? "text-emerald-400" : "text-red-400"}>{netRep >= 0 ? "+" : ""}{netRep}</span>
          </h2>
          <h3 className="text-white font-semibold mb-2">Récents</h3>
          <ul className="space-y-2">
            {profile.recentEvents.length === 0 && <li className="text-gray-500">Aucun event encore.</li>}
            {profile.recentEvents.map((e) => (
              <li key={e.id} className="text-sm text-gray-300">
                {e.type === "respect" ? "⭐" : "🍄"} match <code className="text-gray-500">{e.match_id}</code> · weight {e.weight}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Test + commit**

Manual : `/u/Nunch-N7789` doit afficher la page.

```bash
git add src/app src/lib/api.ts
git commit -m "feat(webapp): public profile page /u/[riotId]"
```

---

### Task 1.19 — Webapp `/auth/callback` redirige vers `/auth/link` si pas lié

**Files:**
- Modify: `src/app/auth/callback/page.tsx`

- [ ] **Step 1: Read current file**

`Read src/app/auth/callback/page.tsx` pour voir le contenu actuel.

- [ ] **Step 2: Modifier la logique de callback**

Après réception du token, faire un fetch `/profile/me`. Si pas de `riot_puuid`, rediriger vers `/auth/link`. Sinon vers `/u/me`.

```tsx
"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { API_URL } from "@/lib/env";

const TOKEN_KEY = "beemobot_token";

export default function CallbackPage() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      router.replace("/");
      return;
    }
    localStorage.setItem(TOKEN_KEY, token);

    fetch(`${API_URL}/profile/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((profile) => {
        if (!profile?.linked) {
          router.replace("/auth/link");
        } else {
          router.replace(`/u/${profile.gameName}-${profile.tagLine}`);
        }
      })
      .catch(() => router.replace("/auth/link"));
  }, [params, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0f1117]">
      <p className="text-white text-lg">Connexion...</p>
    </main>
  );
}
```

- [ ] **Step 3: Add `/profile/me` API endpoint**

In `app/controllers/profile_controller.ts`, add :

```ts
async me({ auth, response }: HttpContext) {
  const user = auth.user!
  return response.json({
    discordId: user.discordId,
    gameName: user.riotGameName,
    tagLine: user.riotTagLine,
    linked: !!user.linkedAt,
  })
}
```

In `start/routes.ts` :

```ts
router.get('/profile/me', [ProfileController, 'me']).use(middleware.auth())
```

- [ ] **Step 4: Commit**

```bash
git add app/controllers/profile_controller.ts start/routes.ts src/app/auth/callback
git commit -m "feat(webapp+api): redirect to /auth/link if user not linked yet"
```

---

### Task 1.20 — Bot : commande `/link`

**Files:**
- Create: `bot/Discord/Commands/link.py`
- Modify: `bot/Discord/Commands/global_commands.py`
- Modify: `bot/config.py`

- [ ] **Step 1: Add WEBAPP_URL to config**

In `config.py` :

```python
WEBAPP_URL = os.getenv("WEBAPP_URL", "http://localhost:3000")
```

- [ ] **Step 2: Create command module**

```python
# Last updated: 2026-05-06
import discord
from discord import app_commands
from config import WEBAPP_URL


def register_link(bot):
    @bot.tree.command(name="link", description="Lie ton compte Discord à ton compte Riot")
    async def link_cmd(interaction: discord.Interaction):
        embed = discord.Embed(
            title="🔗 Lie ton compte Riot",
            description=(
                "Pour donner des shrooms ou des respects, tu dois lier ton compte Riot une fois.\n\n"
                f"👉 [Clique ici pour lier]({WEBAPP_URL}/auth/link)\n\n"
                "*Une seule fois pour toujours.*"
            ),
            color=0x5865F2,
        )
        await interaction.response.send_message(embed=embed, ephemeral=True)
```

- [ ] **Step 3: Wire in global_commands**

In `Discord/Commands/global_commands.py`, replace the existing `/shroom` and `/respect` commands by importing and calling `register_link(bot)` and removing the old shroom/respect handlers.

Add at top of `global_commands.py` :
```python
from Discord.Commands.link import register_link
```

In `setup_global_commands(bot)`, add at the end :
```python
register_link(bot)
```

Remove the entire `@bot.tree.command(name="shroom" ...)` block and `@bot.tree.command(name="respect" ...)` block.

- [ ] **Step 4: Smoke test**

Run the bot, type `/link` in Discord, verify embed with the webapp link.

- [ ] **Step 5: Commit**

```bash
cd ../bot
git add Discord/Commands/link.py Discord/Commands/global_commands.py config.py
git commit -m "feat(bot): /link command + remove legacy /shroom /respect"
```

---

### Task 1.21 — Bot : commande `/me`

**Files:**
- Create: `bot/Discord/Commands/me.py`
- Modify: `bot/Discord/Commands/api_beemo.py`
- Modify: `bot/Discord/Commands/global_commands.py`

- [ ] **Step 1: Add API call helper**

In `api_beemo.py`, append :

```python
async def get_profile(puuid: str):
    return await _get_json(f"/profile/{puuid}")
```

And rename `_get_json` and `_post_json` to use the right base URL paths. Update `GAME_URL` to use both `/rep` and `/profile` and `/economy` paths — actually, let's restructure:

Replace the entire `api_beemo.py` content with :

```python
# Last updated: 2026-05-06
import logging
import aiohttp
from config import BEEMO_API_BASE_URL

logger = logging.getLogger(__name__)
DEFAULT_TIMEOUT = aiohttp.ClientTimeout(total=10)


async def _request(method: str, path: str, json: dict | None = None):
    url = f"{BEEMO_API_BASE_URL}{path}"
    try:
        async with aiohttp.ClientSession(timeout=DEFAULT_TIMEOUT) as session:
            async with session.request(method, url, json=json) as resp:
                if resp.status >= 400:
                    body = await resp.text()
                    logger.warning("%s %s -> %d: %s", method, url, resp.status, body)
                    return None
                return await resp.json()
    except aiohttp.ClientError as exc:
        logger.error("%s %s failed: %s", method, url, exc)
        return None


async def get_profile(puuid: str):
    return await _request("GET", f"/profile/{puuid}")


async def get_eligible(giver_puuid: str, receiver_puuid: str):
    return await _request(
        "GET",
        f"/rep/eligible?giverPuuid={giver_puuid}&receiverPuuid={receiver_puuid}",
    )


async def give_rep(payload: dict):
    return await _request("POST", "/rep/give", json=payload)
```

- [ ] **Step 2: Create /me command**

```python
# Last updated: 2026-05-06
import discord
from discord import app_commands
from Discord.Commands.api_beemo import get_profile

# Map Discord ID -> PUUID will be discovered via API in a real flow.
# For Phase 1 we just ask the user to provide their riot_id manually if they're not linked yet.


def register_me(bot):
    @bot.tree.command(name="me", description="Affiche ta réputation BeemoBot")
    @app_commands.describe(riot_id="Ton Riot ID au format Name-Tag (ex: Nunch-N7789)")
    async def me_cmd(interaction: discord.Interaction, riot_id: str):
        # Naive resolve via /lol/summoner endpoint (read-only)
        from Discord.Commands.api_beemo import _request
        summ = await _request("GET", f"/lol/summoner/{riot_id}")
        if not summ or not summ.get("puuid"):
            await interaction.response.send_message("❌ Riot ID introuvable.", ephemeral=True)
            return
        profile = await get_profile(summ["puuid"])
        if not profile:
            await interaction.response.send_message("❌ Profil introuvable.", ephemeral=True)
            return

        net = profile["counts"]["respects"] - profile["counts"]["shrooms"]
        embed = discord.Embed(
            title=f"{profile['gameName']}#{profile['tagLine']}",
            color=0xF5C242 if net >= 0 else 0xDC2626,
        )
        embed.add_field(name="⭐ Respects", value=str(profile["counts"]["respects"]))
        embed.add_field(name="🍄 Shrooms", value=str(profile["counts"]["shrooms"]))
        embed.add_field(name="🍯 Honey", value=str(profile["honey"]))
        embed.add_field(name="Score net", value=f"{net:+d}")
        await interaction.response.send_message(embed=embed, ephemeral=True)
```

- [ ] **Step 3: Wire in global_commands**

```python
from Discord.Commands.me import register_me
# In setup_global_commands :
register_me(bot)
```

Remove old `/user` command (replaced by `/me`).

- [ ] **Step 4: Commit**

```bash
git add Discord/Commands/me.py Discord/Commands/api_beemo.py Discord/Commands/global_commands.py
git commit -m "feat(bot): /me command + new /rep /profile API client"
```

---

### Task 1.22 — Bot : commande `/judge` (réactif Phase 1)

**Files:**
- Create: `bot/Discord/Commands/judge.py`
- Modify: `bot/Discord/Commands/global_commands.py`

- [ ] **Step 1: Create judge command with buttons**

```python
# Last updated: 2026-05-06
import discord
from discord import app_commands
from Discord.Commands.api_beemo import _request, get_eligible, give_rep


class JudgeView(discord.ui.View):
    def __init__(self, giver_discord_id: str, giver_puuid: str, receiver_puuid: str, match_id: str, can_shroom: bool, can_respect: bool):
        super().__init__(timeout=300)
        self.giver_discord_id = giver_discord_id
        self.giver_puuid = giver_puuid
        self.receiver_puuid = receiver_puuid
        self.match_id = match_id
        if can_shroom:
            self.add_item(self._button("🍄 Shroom", "shroom", discord.ButtonStyle.danger))
        if can_respect:
            self.add_item(self._button("⭐ Respect", "respect", discord.ButtonStyle.success))

    def _button(self, label: str, kind: str, style: discord.ButtonStyle):
        button = discord.ui.Button(label=label, style=style, custom_id=f"{kind}-{self.match_id}")

        async def callback(interaction: discord.Interaction):
            payload = {
                "giverDiscordId": self.giver_discord_id,
                "receiverPuuid": self.receiver_puuid,
                "matchId": self.match_id,
                "type": kind,
                "guildId": str(interaction.guild_id) if interaction.guild_id else None,
            }
            result = await give_rep(payload)
            if result:
                await interaction.response.send_message(
                    f"✅ {kind.title()} envoyé pour le match `{self.match_id}` (weight {result['weight']})",
                    ephemeral=True,
                )
            else:
                await interaction.response.send_message("❌ Échec de l'envoi.", ephemeral=True)

        button.callback = callback
        return button


def register_judge(bot):
    @bot.tree.command(name="judge", description="Juge un joueur que tu as croisé en game")
    @app_commands.describe(riot_id="Riot ID de la cible (ex: Nunch-N7789)")
    async def judge_cmd(interaction: discord.Interaction, riot_id: str):
        # Resolve target puuid
        target = await _request("GET", f"/lol/summoner/{riot_id}")
        if not target or not target.get("puuid"):
            await interaction.response.send_message("❌ Riot ID introuvable.", ephemeral=True)
            return

        # Resolve giver puuid via API (we need a /profile/me-like endpoint that gives back our own puuid)
        me = await _request(
            "GET",
            "/profile/by-discord/" + str(interaction.user.id),
        )
        if not me or not me.get("puuid"):
            await interaction.response.send_message(
                "❌ Tu dois lier ton compte Riot d'abord — utilise `/link`.",
                ephemeral=True,
            )
            return

        eligible = await get_eligible(me["puuid"], target["puuid"])
        if not eligible or not eligible.get("matches"):
            await interaction.response.send_message(
                "❌ Aucun match commun trouvé dans tes 20 dernières games.",
                ephemeral=True,
            )
            return

        await interaction.response.send_message(
            f"🎯 **Matches éligibles avec {target['gameName']}#{target['tagLine']}** :",
            ephemeral=True,
        )
        for m in eligible["matches"][:5]:
            view = JudgeView(
                giver_discord_id=str(interaction.user.id),
                giver_puuid=me["puuid"],
                receiver_puuid=target["puuid"],
                match_id=m["matchId"],
                can_shroom=m["canShroom"],
                can_respect=m["canRespect"],
            )
            await interaction.followup.send(
                f"Match `{m['matchId']}`",
                view=view,
                ephemeral=True,
            )
```

- [ ] **Step 2: Add `/profile/by-discord/:id` API endpoint**

In `app/controllers/profile_controller.ts`, append :

```ts
async byDiscord({ params, response }: HttpContext) {
  const user = await User.findBy('discordId', params.id)
  if (!user?.riotPuuid) return response.status(404).json({ error: 'not_linked' })
  return response.json({
    puuid: user.riotPuuid,
    gameName: user.riotGameName,
    tagLine: user.riotTagLine,
  })
}
```

In `start/routes.ts` :

```ts
router.get('/profile/by-discord/:id', [ProfileController, 'byDiscord'])
```

- [ ] **Step 3: Wire**

```python
# In global_commands.py
from Discord.Commands.judge import register_judge
# In setup_global_commands :
register_judge(bot)
```

- [ ] **Step 4: Manual e2e**

Avec deux comptes Discord linkés à deux Riot ayant joué ensemble : `/judge Nunch-N7789` → bouton respect → check `/u/Nunch-N7789` sur webapp.

- [ ] **Step 5: Commit (bot + api)**

```bash
# bot/
git add Discord/Commands/judge.py Discord/Commands/global_commands.py
git commit -m "feat(bot): /judge command — reactive rep give Phase 1"

# beemobot-api/
cd ../beemobot-api
git add app/controllers/profile_controller.ts start/routes.ts
git commit -m "feat(api): GET /profile/by-discord/:id (used by bot /judge)"
```

---

### Task 1.23 — End-to-end smoke test (manuel)

**Files:**
- Create: `docs/superpowers/specs/SMOKE-PHASE1.md`

- [ ] **Step 1: Write a 1-page checklist**

```markdown
# Smoke test Phase 1

## Pré-requis
- API qui tourne sur :3333
- Webapp qui tourne sur :3000
- Bot qui tourne avec ses tokens
- 2 comptes Discord (A et B) avec accès au serveur de test
- 2 comptes Riot (A et B) ayant joué une game ensemble dans les 24h

## Steps
1. [ ] User A : `/link` sur Discord → ouvre webapp, link son compte Riot → confirmé sur `/u/Riot-A-Tag`
2. [ ] User B : idem
3. [ ] User A : `/judge Riot-B-Tag` → bouton respect sur leur match commun
4. [ ] User B : `/me Riot-B-Tag` → voit `⭐ Respects: 1` et `🍯 Honey: 10`
5. [ ] Webapp : `/u/Riot-B-Tag` → page publique affiche les mêmes valeurs
6. [ ] User A : retape `/judge Riot-B-Tag` → le même bouton respect ne réapparaît pas pour ce match (slot used)
7. [ ] User A : `/judge Riot-B-Tag` → bouton shroom sur ce même match → fonctionne
8. [ ] User B : `/me Riot-B-Tag` → `🍄 Shrooms: 1`, `🍯 Honey: 15`

✅ Phase 1 validée si les 8 steps passent.
```

- [ ] **Step 2: Run le smoke + commit**

```bash
git add docs/superpowers/specs/SMOKE-PHASE1.md
git commit -m "docs: smoke test checklist Phase 1"
```

---

# Phase 2 — Match Worker Proactif (semaines 4-6)

**Definition of Done :** Tu finis une game LoL, dans les 5 min tu reçois un DM Discord automatique avec les boutons shroom/respect pour chaque participant linké.

---

### Task 2.1 — Demander une Personal API Key Riot

**Files:** N/A (process step, ~30 min)

- [ ] **Step 1:** Aller sur https://developer.riotgames.com/app-type
- [ ] **Step 2:** Demander une "Personal API Key" en décrivant le projet (BeemoBot — social reputation system based on Riot match history). Décrire qu'on poll les match histories pour déclencher des notifications Discord.
- [ ] **Step 3:** Délai d'attente ~1-2 sem. Pendant ce temps, dev avec la dev key (limite 100/2min).

---

### Task 2.2 — Create `dm_queue` migration

**Files:**
- Create: `database/migrations/1746500005000_create_dm_queue.ts`

- [ ] **Step 1:** Make + content :

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'dm_queue'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('discord_id', 32).notNullable()
      table.string('match_id', 64).notNullable()
      table.jsonb('participants').notNullable()
      table.string('status', 20).notNullable().defaultTo('pending')
      table.integer('attempts').notNullable().defaultTo(0)
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('sent_at', { useTz: true }).nullable()
      table.text('last_error').nullable()

      table.unique(['discord_id', 'match_id'])
      table.index(['status', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

- [ ] **Step 2:** Run + commit

```bash
node ace migration:run
git add database/migrations
git commit -m "feat(api): dm_queue table for the Phase 2 worker"
```

---

### Task 2.3 — Worker : structure du module Python

**Files:**
- Create: `bot/worker/__init__.py`
- Create: `bot/worker/main.py`
- Create: `bot/worker/rate_limiter.py`
- Create: `bot/worker/riot_poller.py`

- [ ] **Step 1: rate_limiter.py**

```python
# Last updated: 2026-05-06
"""Token bucket rate limiter for Riot API."""
import asyncio
import time


class TokenBucket:
    def __init__(self, rate: float, capacity: int):
        """rate: tokens added per second; capacity: max tokens stored."""
        self.rate = rate
        self.capacity = capacity
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: int = 1):
        async with self._lock:
            while True:
                now = time.monotonic()
                elapsed = now - self.last_refill
                self.tokens = min(self.capacity, self.tokens + elapsed * self.rate)
                self.last_refill = now
                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return
                wait = (tokens - self.tokens) / self.rate
            await asyncio.sleep(wait)


# Riot dev key allows ~50 req / 2 min => ~0.4 req/s. Be conservative at 0.3.
# Personal API key would be higher (we'll bump to 1.5 once granted).
RIOT_BUCKET = TokenBucket(rate=0.3, capacity=20)
```

- [ ] **Step 2: riot_poller.py**

```python
# Last updated: 2026-05-06
"""Polls Riot match history for linked users and writes dm_queue entries."""
import asyncio
import logging
import os
import psycopg2
import psycopg2.extras
import aiohttp
from typing import Optional
from worker.rate_limiter import RIOT_BUCKET

logger = logging.getLogger(__name__)

RIOT_API_KEY = os.getenv("RIOT_API_KEY")
DB_DSN = os.getenv("WORKER_DB_DSN") or (
    f"host={os.getenv('DB_HOST', 'localhost')} "
    f"port={os.getenv('DB_PORT', '5432')} "
    f"dbname={os.getenv('DB_DATABASE', 'postgres')} "
    f"user={os.getenv('DB_USER', 'postgres')} "
    f"password={os.getenv('DB_PASSWORD', '')}"
)


async def _riot_get(session: aiohttp.ClientSession, url: str, retry: int = 3) -> Optional[dict]:
    for attempt in range(retry):
        await RIOT_BUCKET.acquire()
        try:
            async with session.get(url, headers={"X-Riot-Token": RIOT_API_KEY}) as r:
                if r.status == 200:
                    return await r.json()
                if r.status == 429:
                    delay = int(r.headers.get("Retry-After", "5"))
                    logger.warning("429 from Riot, sleeping %ds", delay)
                    await asyncio.sleep(delay)
                    continue
                if r.status == 404:
                    return None
                logger.warning("Riot returned %d for %s", r.status, url)
                return None
        except aiohttp.ClientError as exc:
            logger.error("Riot request failed: %s", exc)
            await asyncio.sleep(2 ** attempt)
    return None


async def poll_user(session: aiohttp.ClientSession, user: dict, conn) -> int:
    """Poll one user, insert dm_queue entries for new matches. Returns count of new matches."""
    puuid = user["riot_puuid"]
    last_match = user["last_polled_match_id"]

    history_url = (
        f"https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/{puuid}/ids?count=10"
    )
    match_ids = await _riot_get(session, history_url)
    if not match_ids:
        return 0

    new_matches = []
    for mid in match_ids:
        if mid == last_match:
            break
        new_matches.append(mid)

    if not new_matches:
        return 0

    inserted = 0
    with conn.cursor() as cur:
        for mid in new_matches:
            details = await _riot_get(
                session, f"https://europe.api.riotgames.com/lol/match/v5/matches/{mid}"
            )
            if not details:
                continue

            participants = details["info"]["participants"]
            participant_puuids = [p["puuid"] for p in participants]

            cur.execute(
                "SELECT discord_id, riot_puuid, riot_game_name, riot_tag_line "
                "FROM users WHERE riot_puuid = ANY(%s) AND linked_at IS NOT NULL",
                (participant_puuids,),
            )
            linked_in_match = cur.fetchall()

            for row in linked_in_match:
                others_payload = []
                for p in participants:
                    if p["puuid"] == row[1]:
                        continue
                    others_payload.append({
                        "puuid": p["puuid"],
                        "championName": p["championName"],
                        "kills": p["kills"],
                        "deaths": p["deaths"],
                        "assists": p["assists"],
                        "win": p["win"],
                        "teamId": p["teamId"],
                    })
                cur.execute(
                    "INSERT INTO dm_queue (discord_id, match_id, participants) "
                    "VALUES (%s, %s, %s::jsonb) "
                    "ON CONFLICT (discord_id, match_id) DO NOTHING",
                    (row[0], mid, psycopg2.extras.Json(others_payload)),
                )
                inserted += cur.rowcount

        cur.execute(
            "INSERT INTO match_poll_state (user_puuid, last_polled_match_id, last_polled_at) "
            "VALUES (%s, %s, NOW()) "
            "ON CONFLICT (user_puuid) DO UPDATE SET "
            "last_polled_match_id = EXCLUDED.last_polled_match_id, "
            "last_polled_at = EXCLUDED.last_polled_at",
            (puuid, new_matches[0]),
        )
    conn.commit()
    return inserted


async def poll_all() -> None:
    conn = psycopg2.connect(DB_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT u.riot_puuid, u.discord_id, u.riot_game_name, u.riot_tag_line, "
                "       s.last_polled_match_id "
                "FROM users u "
                "LEFT JOIN match_poll_state s ON u.riot_puuid = s.user_puuid "
                "WHERE u.linked_at IS NOT NULL AND u.riot_puuid IS NOT NULL"
            )
            users = [
                {"riot_puuid": r[0], "discord_id": r[1], "riot_game_name": r[2],
                 "riot_tag_line": r[3], "last_polled_match_id": r[4]}
                for r in cur.fetchall()
            ]
        async with aiohttp.ClientSession() as session:
            total = 0
            for user in users:
                total += await poll_user(session, user, conn)
        logger.info("poll_all done: %d new matches enqueued", total)
    finally:
        conn.close()
```

- [ ] **Step 3: main.py**

```python
# Last updated: 2026-05-06
"""Worker entrypoint. Loops every WORKER_INTERVAL_S."""
import asyncio
import logging
import os
from worker.riot_poller import poll_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(name)s - %(message)s")
logger = logging.getLogger("worker")

WORKER_INTERVAL_S = int(os.getenv("WORKER_INTERVAL_S", "300"))


async def main():
    while True:
        try:
            await poll_all()
        except Exception:
            logger.exception("poll_all crashed")
        logger.info("Sleeping %ds", WORKER_INTERVAL_S)
        await asyncio.sleep(WORKER_INTERVAL_S)


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 4: Add psycopg2 to requirements.txt**

In `bot/requirements.txt`, append :

```
psycopg2-binary==2.9.10
```

- [ ] **Step 5: Smoke test the worker**

```bash
pip install -r requirements.txt
python -m worker.main
```

Avec un user linked qui a une game récente, vérifier :
- `psql ... -c "SELECT * FROM dm_queue;"` → row apparu

- [ ] **Step 6: Commit**

```bash
git add bot/worker bot/requirements.txt
git commit -m "feat(worker): proactive Riot match poller (Phase 2)"
```

---

### Task 2.4 — Bot DM consumer

**Files:**
- Create: `bot/worker/dm_dispatcher.py`
- Create: `bot/Discord/Commands/rep_buttons.py`
- Modify: `bot/Discord/bot.py` to start the consumer

- [ ] **Step 1: rep_buttons.py — reusable view**

```python
# Last updated: 2026-05-06
import discord
from Discord.Commands.api_beemo import give_rep


class MatchRepView(discord.ui.View):
    def __init__(self, giver_discord_id: str, match_id: str, participants: list, guild_id: str | None):
        super().__init__(timeout=86400)  # 24h
        self.giver_discord_id = giver_discord_id
        self.match_id = match_id
        self.guild_id = guild_id
        for p in participants[:8]:  # cap UI buttons
            self.add_item(self._btn(p, "shroom"))
            self.add_item(self._btn(p, "respect"))

    def _btn(self, participant: dict, kind: str):
        emoji = "🍄" if kind == "shroom" else "⭐"
        style = discord.ButtonStyle.danger if kind == "shroom" else discord.ButtonStyle.success
        button = discord.ui.Button(
            label=f"{emoji} {participant['championName']}",
            style=style,
            custom_id=f"{kind}-{self.match_id}-{participant['puuid'][:8]}",
        )

        async def callback(interaction: discord.Interaction):
            await interaction.response.defer(ephemeral=True)
            payload = {
                "giverDiscordId": self.giver_discord_id,
                "receiverPuuid": participant["puuid"],
                "matchId": self.match_id,
                "type": kind,
                "guildId": self.guild_id,
            }
            result = await give_rep(payload)
            if result:
                await interaction.followup.send(
                    f"✅ {kind.title()} envoyé sur {participant['championName']}",
                    ephemeral=True,
                )
                button.disabled = True
                await interaction.message.edit(view=self)
            else:
                await interaction.followup.send("❌ Échec.", ephemeral=True)

        button.callback = callback
        return button
```

- [ ] **Step 2: dm_dispatcher.py**

```python
# Last updated: 2026-05-06
"""Polls dm_queue and sends Discord DMs with rep buttons."""
import asyncio
import logging
import os
import psycopg2
import discord
from worker.riot_poller import DB_DSN
from Discord.Commands.rep_buttons import MatchRepView

logger = logging.getLogger(__name__)
DM_INTERVAL_S = int(os.getenv("DM_INTERVAL_S", "30"))


async def dispatch_loop(bot: discord.Client):
    """Bot must be ready before calling. Loops forever."""
    while True:
        try:
            await _process_batch(bot)
        except Exception:
            logger.exception("dm dispatch crashed")
        await asyncio.sleep(DM_INTERVAL_S)


async def _process_batch(bot: discord.Client):
    conn = psycopg2.connect(DB_DSN)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, discord_id, match_id, participants "
                "FROM dm_queue WHERE status = 'pending' AND attempts < 3 "
                "ORDER BY created_at LIMIT 20"
            )
            rows = cur.fetchall()

            for row_id, discord_id, match_id, participants in rows:
                try:
                    user = await bot.fetch_user(int(discord_id))
                    embed = discord.Embed(
                        title="🎮 Game terminée — qui mérite quoi ?",
                        description=f"Match `{match_id}`",
                        color=0x5865F2,
                    )
                    for p in participants[:10]:
                        embed.add_field(
                            name=p["championName"],
                            value=f"K/D/A {p['kills']}/{p['deaths']}/{p['assists']} "
                                  f"{'🏆 Win' if p['win'] else '💀 Loss'}",
                            inline=False,
                        )
                    view = MatchRepView(
                        giver_discord_id=discord_id,
                        match_id=match_id,
                        participants=participants,
                        guild_id=None,
                    )
                    await user.send(embed=embed, view=view)
                    cur.execute(
                        "UPDATE dm_queue SET status='sent', sent_at=NOW() WHERE id=%s",
                        (row_id,),
                    )
                except discord.Forbidden:
                    cur.execute(
                        "UPDATE dm_queue SET status='failed', last_error='dm_forbidden', attempts=attempts+1 WHERE id=%s",
                        (row_id,),
                    )
                except Exception as exc:
                    logger.exception("DM failed: %s", exc)
                    cur.execute(
                        "UPDATE dm_queue SET attempts=attempts+1, last_error=%s WHERE id=%s",
                        (str(exc)[:200], row_id),
                    )
                conn.commit()
                await asyncio.sleep(1.5)  # rate limit DMs
    finally:
        conn.close()
```

- [ ] **Step 3: Wire in bot.py**

In `Discord/bot.py`, after `bot = MyBot()`, add :

```python
@bot.event
async def on_ready():
    print(Back.YELLOW + f"Bot is ready as {bot.user}" + Style.RESET_ALL)
    from worker.dm_dispatcher import dispatch_loop
    bot.loop.create_task(dispatch_loop(bot))
```

(Replace the existing `on_ready` if it's identical.)

- [ ] **Step 4: Smoke**

Avec un row dans `dm_queue` (insère manuellement ou via worker), bot relancé → DM reçu sur Discord avec boutons.

- [ ] **Step 5: Commit**

```bash
git add bot/worker/dm_dispatcher.py bot/Discord/Commands/rep_buttons.py bot/Discord/bot.py
git commit -m "feat(bot): DM dispatcher consumes dm_queue and sends rep buttons"
```

---

### Task 2.5 — Sanity tests Phase 2

**Files:**
- Modify: `docs/superpowers/specs/SMOKE-PHASE1.md` → rename `SMOKE-PHASE2.md`

- [ ] **Step 1:** Append à la checklist :

```markdown
## Phase 2 (worker proactif)
1. [ ] User A et B linkés. Worker started. Tu joues une vraie game ensemble.
2. [ ] Dans les 5 min après la game, A reçoit un DM avec embed + boutons pour B (et autres participants).
3. [ ] Idem pour B.
4. [ ] Click bouton respect → la rep apparaît sur `/u/Riot-A-Tag` et `/u/Riot-B-Tag`.
5. [ ] Bouton se désactive après usage.
6. [ ] Re-trigger : même game → pas de double DM (`UNIQUE INDEX dm_queue`).
```

- [ ] **Step 2:** Run le smoke + commit.

```bash
git add docs/superpowers/specs/SMOKE-PHASE2.md
git commit -m "docs: smoke test Phase 2"
```

---

# Phase 3 — Économie & Hall of Fame (semaines 7-9)

**Definition of Done :** Un user peut gagner du honey via rep + daily login + mini-jeux, le dépenser sur trivia (pari) et sur cosmétiques. Le webapp affiche les leaderboards trending.

---

### Task 3.1 — Daily honey trigger

**Files:**
- Modify: `app/services/honey_service.ts`
- Create: `app/middleware/daily_honey_middleware.ts`

- [ ] **Step 1: HoneyService.tryDaily method**

In `honey_service.ts`, add :

```ts
import { DateTime } from 'luxon'
import User from '#models/user'

const DAILY_HONEY = 20

static async tryDaily(user: User): Promise<boolean> {
  const today = DateTime.now().toISODate()
  if (user.lastDailyAt && user.lastDailyAt.toString() === today) return false
  await this.credit(user.riotPuuid!, DAILY_HONEY, 'daily_login', { date: today })
  user.lastDailyAt = DateTime.fromISO(today!)
  await user.save()
  return true
}
```

- [ ] **Step 2: Middleware**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import HoneyService from '#services/honey_service'

export default class DailyHoneyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth?.user
    if (user?.riotPuuid && user.linkedAt) {
      try {
        await HoneyService.tryDaily(user)
      } catch {
        // never block the request on daily honey failure
      }
    }
    return next()
  }
}
```

- [ ] **Step 3: Register + apply on `/economy/balance`**

Open `start/kernel.ts`, register middleware:

```ts
export const middleware = router.named({
  // ...existing
  dailyHoney: () => import('#middleware/daily_honey_middleware'),
})
```

Then in `start/routes.ts` :

```ts
router
  .get('/economy/balance', [EconomyController, 'balance'])
  .use([middleware.auth(), middleware.dailyHoney()])
```

- [ ] **Step 4: Commit**

```bash
git add app/services app/middleware start/routes.ts start/kernel.ts
git commit -m "feat(api): daily honey grant via middleware"
```

---

### Task 3.2 — `/economy/spend` and `/economy/credit` endpoints

**Files:**
- Modify: `app/controllers/economy_controller.ts`
- Create: `app/validators/economy.ts`
- Modify: `start/routes.ts`

- [ ] **Step 1: Validator**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const spendValidator = vine.compile(
  vine.object({
    amount: vine.number().positive().max(100000),
    reason: vine.enum(['minigame_bet', 'cosmetic_purchase']),
    metadata: vine.object({}).allowUnknownProperties().optional(),
  })
)

export const creditValidator = vine.compile(
  vine.object({
    userPuuid: vine.string().trim().minLength(40).maxLength(128),
    amount: vine.number().positive().max(100000),
    reason: vine.enum(['minigame_win']),
    metadata: vine.object({}).allowUnknownProperties().optional(),
  })
)
```

- [ ] **Step 2: Extend controller**

```ts
async spend({ auth, request, response }: HttpContext) {
  const user = auth.user!
  if (!user.riotPuuid) return response.status(409).json({ error: 'not_linked' })
  const payload = await request.validateUsing(spendValidator)
  try {
    await HoneyService.debit(user.riotPuuid, payload.amount, payload.reason, payload.metadata ?? null)
  } catch (error: any) {
    if (error.message === 'insufficient_honey') {
      return response.status(402).json({ error: 'insufficient_honey' })
    }
    throw error
  }
  const balance = await HoneyService.balance(user.riotPuuid)
  return response.json({ balance })
}

async credit({ request, response }: HttpContext) {
  // Internal endpoint — protected by API key in env (basic shared secret).
  const apiKey = request.header('x-internal-key')
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return response.status(401).json({ error: 'forbidden' })
  }
  const payload = await request.validateUsing(creditValidator)
  await HoneyService.credit(payload.userPuuid, payload.amount, payload.reason, payload.metadata ?? null)
  return response.status(201).json({ ok: true })
}
```

Add at top : `import { spendValidator, creditValidator } from '#validators/economy'`

- [ ] **Step 3: Routes + env**

```ts
router.post('/economy/spend', [EconomyController, 'spend']).use(middleware.auth())
router.post('/economy/credit', [EconomyController, 'credit'])
```

In `start/env.ts`, add `INTERNAL_API_KEY: Env.schema.string()` and in `.env` set a strong random value.

- [ ] **Step 4: Commit**

```bash
git add app/controllers app/validators start/routes.ts start/env.ts .env.example
git commit -m "feat(api): /economy/spend + /economy/credit (internal)"
```

---

### Task 3.3 — Mini-jeux : connect bet/win to honey

**Files:**
- Create: `src/lib/honey.ts`
- Modify: each of the 5 mini-game components in `src/components/organisms/`

- [ ] **Step 1: Webapp honey client**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { API_URL } from "@/lib/env";

const TOKEN_KEY = "beemobot_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export async function spendHoney(amount: number, reason: "minigame_bet" | "cosmetic_purchase", metadata: Record<string, any> = {}): Promise<{ ok: boolean; balance?: number; error?: string }> {
  const token = getToken();
  if (!token) return { ok: false, error: "not_authenticated" };
  const res = await fetch(`${API_URL}/economy/spend`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ amount, reason, metadata }),
  });
  if (res.status === 402) return { ok: false, error: "insufficient_honey" };
  if (!res.ok) return { ok: false, error: "api_error" };
  const data = await res.json();
  return { ok: true, balance: data.balance };
}

export async function getBalance(): Promise<number> {
  const token = getToken();
  if (!token) return 0;
  const res = await fetch(`${API_URL}/economy/balance`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.balance;
}
```

- [ ] **Step 2: Add bet UI to one mini-game (template)**

In `src/components/organisms/LoLTriviaGame.tsx`, before starting a game, add a `BetModal` :

Create `src/components/organisms/BetModal.tsx` :

```tsx
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

"use client";

import { useState, useEffect } from "react";
import { getBalance, spendHoney } from "@/lib/honey";
import Button from "@/components/atoms/Button";

interface Props {
  gameId: string;
  onConfirm: (bet: number) => void;
  onCancel: () => void;
}

export function BetModal({ gameId, onConfirm, onCancel }: Props) {
  const [bet, setBet] = useState(10);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getBalance().then(setBalance);
  }, []);

  const submit = async () => {
    setLoading(true);
    setError(null);
    const result = await spendHoney(bet, "minigame_bet", { game_id: gameId });
    setLoading(false);
    if (!result.ok) {
      if (result.error === "insufficient_honey") setError("Pas assez de honey 🍯");
      else setError("Erreur, réessaye.");
      return;
    }
    onConfirm(bet);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#1a1d28] p-8 rounded-xl border border-gray-700/30 max-w-sm w-full">
        <h2 className="text-2xl font-bold text-white mb-2">🍯 Place ta mise</h2>
        {balance !== null && <p className="text-gray-400 mb-4">Solde : {balance} honey</p>}
        <input
          type="range"
          min="5"
          max={Math.min(100, balance ?? 100)}
          step="5"
          value={bet}
          onChange={(e) => setBet(Number(e.target.value))}
          className="w-full"
        />
        <p className="text-yellow-300 text-2xl text-center my-4">{bet} 🍯</p>
        <p className="text-gray-400 text-sm text-center mb-4">
          Gagne : {bet * 2} 🍯 — perds tout si tu rates
        </p>
        {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={onCancel} className="flex-1 bg-gray-700">Annuler</Button>
          <Button onClick={submit} disabled={loading} className="flex-1 bg-blue-600">
            {loading ? "..." : "Parier"}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire BetModal in 1 game (LoLTrivia)**

In `LoLTriviaGame.tsx`, add before the game starts a `BetModal` flow. On win → call `/economy/credit` via a server-side route handler (since `INTERNAL_API_KEY` is server-side only). Create a Next.js API route :

```ts
// src/app/api/minigame-win/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { puuid, amount, gameId, score } = body;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3333";
  const internalKey = process.env.INTERNAL_API_KEY;
  if (!internalKey) return NextResponse.json({ error: "no_key" }, { status: 500 });

  const res = await fetch(`${apiUrl}/economy/credit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": internalKey,
    },
    body: JSON.stringify({
      userPuuid: puuid,
      amount,
      reason: "minigame_win",
      metadata: { gameId, score },
    }),
  });
  if (!res.ok) return NextResponse.json({ error: "credit_failed" }, { status: 502 });
  return NextResponse.json(await res.json());
}
```

- [ ] **Step 4: Wire LoLTrivia to call /api/minigame-win on success**

In `LoLTriviaGame.tsx`, when the game ends with `score >= passingScore`, call :

```ts
fetch("/api/minigame-win", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ puuid: userPuuid, amount: bet * 2, gameId: "lol-trivia", score }),
});
```

- [ ] **Step 5: Repeat for the 4 other mini-games (DodgeSkillshot, GuessChampion, MemoryMatch, TeemoMinesweeper)**

Same pattern : wrap with `BetModal`, on win call `/api/minigame-win`. Each mini-game becomes a separate task if you want bite-sized — for now group as one task.

- [ ] **Step 6: Add `INTERNAL_API_KEY` to `.env.local`**

In webapp `.env.local` and `.env.example` :

```
INTERNAL_API_KEY=must_match_api_value
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/honey.ts src/components/organisms/BetModal.tsx src/components/organisms/LoLTriviaGame.tsx src/app/api .env.example
git commit -m "feat(webapp): mini-games bet/win wired to honey economy"
```

---

### Task 3.4 — Leaderboard endpoint

**Files:**
- Create: `app/controllers/leaderboard_controller.ts`
- Create: `app/services/leaderboard_service.ts`
- Modify: `start/routes.ts`

- [ ] **Step 1: Service**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import db from '@adonisjs/lucid/services/db'

export type Period = 'week' | 'month' | 'all'
export type LbType = 'respects' | 'shrooms' | 'honey'
export type Scope = 'global' | 'guild'

const PERIOD_DAYS: Record<Period, number | null> = {
  week: 7,
  month: 30,
  all: null,
}

export default class LeaderboardService {
  static async list(period: Period, type: LbType, scope: Scope, guildId?: string, limit = 50) {
    if (type === 'honey') return this.listHoney(period, scope, guildId, limit)
    return this.listRep(period, type, scope, guildId, limit)
  }

  private static async listRep(period: Period, type: LbType, scope: Scope, guildId: string | undefined, limit: number) {
    const repType = type === 'respects' ? 'respect' : 'shroom'
    let query = db
      .from('reputation_events as r')
      .leftJoin('users as u', 'r.receiver_puuid', 'u.riot_puuid')
      .where('r.type', repType)
      .select('r.receiver_puuid as puuid')
      .select('u.riot_game_name as gameName')
      .select('u.riot_tag_line as tagLine')
      .select(db.raw('COUNT(*) as count'))
      .select(db.raw('SUM(r.weight) as weighted'))
      .groupBy('r.receiver_puuid', 'u.riot_game_name', 'u.riot_tag_line')
      .orderBy('weighted', 'desc')
      .limit(limit)

    const days = PERIOD_DAYS[period]
    if (days != null) query = query.whereRaw(`r.created_at > NOW() - INTERVAL '${days} days'`)
    if (scope === 'guild' && guildId) query = query.where('r.guild_id', guildId)

    return query
  }

  private static async listHoney(period: Period, scope: Scope, _guildId: string | undefined, limit: number) {
    let query = db
      .from('honey_ledger as h')
      .leftJoin('users as u', 'h.user_puuid', 'u.riot_puuid')
      .select('h.user_puuid as puuid')
      .select('u.riot_game_name as gameName')
      .select('u.riot_tag_line as tagLine')
      .select(db.raw('SUM(h.delta) as honey'))
      .groupBy('h.user_puuid', 'u.riot_game_name', 'u.riot_tag_line')
      .orderBy('honey', 'desc')
      .limit(limit)

    const days = PERIOD_DAYS[period]
    if (days != null) query = query.whereRaw(`h.created_at > NOW() - INTERVAL '${days} days'`)
    // Honey scope is always global for now — guild scope would need guild membership sync.
    return query
  }
}
```

- [ ] **Step 2: Controller**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import LeaderboardService, { Period, LbType, Scope } from '#services/leaderboard_service'

const PERIODS: Period[] = ['week', 'month', 'all']
const TYPES: LbType[] = ['respects', 'shrooms', 'honey']
const SCOPES: Scope[] = ['global', 'guild']

export default class LeaderboardController {
  async list({ request, response }: HttpContext) {
    const period = (request.qs().period as Period) || 'week'
    const type = (request.qs().type as LbType) || 'respects'
    const scope = (request.qs().scope as Scope) || 'global'
    const guildId = request.qs().guildId as string | undefined

    if (!PERIODS.includes(period) || !TYPES.includes(type) || !SCOPES.includes(scope)) {
      return response.status(400).json({ error: 'invalid_params' })
    }
    const rows = await LeaderboardService.list(period, type, scope, guildId)
    return response.json({ period, type, scope, guildId: guildId ?? null, rows })
  }
}
```

- [ ] **Step 3: Route + commit**

```ts
const LeaderboardController = () => import('#controllers/leaderboard_controller')
router.get('/leaderboard', [LeaderboardController, 'list'])
```

```bash
git add app/services app/controllers start/routes.ts
git commit -m "feat(api): GET /leaderboard with period/type/scope filters"
```

---

### Task 3.5 — Webapp `/leaderboard` page

**Files:**
- Create: `src/app/leaderboard/page.tsx`
- Create: `src/components/organisms/LeaderboardTable.tsx`

- [ ] **Step 1: Component**

```tsx
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

"use client";

import Link from "next/link";

interface Row {
  puuid: string;
  gameName: string | null;
  tagLine: string | null;
  count?: number;
  weighted?: number;
  honey?: number;
}

export function LeaderboardTable({ rows, type }: { rows: Row[]; type: "respects" | "shrooms" | "honey" }) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="text-gray-400 border-b border-gray-700/30">
          <th className="py-3">#</th>
          <th>Joueur</th>
          <th className="text-right">{type === "honey" ? "🍯 Honey" : type === "respects" ? "⭐ Respects" : "🍄 Shrooms"}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.puuid} className="border-b border-gray-800/30 hover:bg-[#1a1d28]/50">
            <td className="py-2 text-gray-500">{i + 1}</td>
            <td>
              {r.gameName ? (
                <Link href={`/u/${r.gameName}-${r.tagLine}`} className="text-white hover:text-blue-400">
                  {r.gameName}#{r.tagLine}
                </Link>
              ) : (
                <span className="text-gray-500">Compte non lié</span>
              )}
            </td>
            <td className="text-right text-yellow-300">
              {type === "honey" ? Number(r.honey) : Number(r.weighted ?? r.count).toFixed(1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Page**

```tsx
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/env";
import { LeaderboardTable } from "@/components/organisms/LeaderboardTable";

const PERIODS = [
  { v: "week", l: "Cette semaine" },
  { v: "month", l: "Ce mois" },
  { v: "all", l: "All-time" },
];
const TYPES = [
  { v: "respects", l: "⭐ Respects" },
  { v: "shrooms", l: "🍄 Shrooms" },
  { v: "honey", l: "🍯 Honey" },
];

export default function LeaderboardPage() {
  const [period, setPeriod] = useState("week");
  const [type, setType] = useState<"respects" | "shrooms" | "honey">("respects");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/leaderboard?period=${period}&type=${type}&scope=global`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .finally(() => setLoading(false));
  }, [period, type]);

  return (
    <main className="min-h-screen bg-[#0f1117] py-20 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-8">🏆 Hall of Fame mondial</h1>
        <div className="flex gap-2 mb-2">
          {PERIODS.map((p) => (
            <button
              key={p.v}
              onClick={() => setPeriod(p.v)}
              className={`px-3 py-1 rounded ${period === p.v ? "bg-blue-600 text-white" : "bg-[#1a1d28] text-gray-400"}`}
            >
              {p.l}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-6">
          {TYPES.map((t) => (
            <button
              key={t.v}
              onClick={() => setType(t.v as any)}
              className={`px-3 py-1 rounded ${type === t.v ? "bg-blue-600 text-white" : "bg-[#1a1d28] text-gray-400"}`}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="bg-[#1a1d28] p-6 rounded-xl border border-gray-700/30">
          {loading ? <p className="text-gray-400">Chargement...</p> : <LeaderboardTable rows={rows} type={type} />}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/leaderboard src/components/organisms/LeaderboardTable.tsx
git commit -m "feat(webapp): /leaderboard page with period/type filters"
```

---

### Task 3.6 — Cosmétiques : DB + endpoints + shop UI

**Files:**
- Create: `database/migrations/1746500006000_create_cosmetics.ts`
- Create: `app/models/cosmetic.ts`, `app/models/user_cosmetic.ts`
- Create: `app/controllers/shop_controller.ts`
- Create: `app/validators/shop.ts`
- Create: `database/seeders/cosmetic_seeder.ts`
- Create: `src/app/shop/page.tsx`
- Create: `src/components/organisms/CosmeticCard.tsx`

- [ ] **Step 1: Migration**

```bash
node ace make:migration create_cosmetics
```

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('cosmetics', (table) => {
      table.string('id', 50).primary()
      table.string('name', 100).notNullable()
      table.string('type', 30).notNullable() // 'badge', 'border', 'glow'
      table.string('asset_url', 500).notNullable()
      table.integer('price_honey').notNullable()
      table.timestamp('created_at').defaultTo(this.now())
    })

    this.schema.createTable('user_cosmetics', (table) => {
      table.increments('id').primary()
      table.string('user_puuid', 128).notNullable()
      table.string('cosmetic_id', 50).notNullable()
      table.boolean('equipped').notNullable().defaultTo(false)
      table.timestamp('purchased_at').defaultTo(this.now())
      table.unique(['user_puuid', 'cosmetic_id'])
    })
  }

  async down() {
    this.schema.dropTable('user_cosmetics')
    this.schema.dropTable('cosmetics')
  }
}
```

- [ ] **Step 2: Models**

`app/models/cosmetic.ts` :
```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Cosmetic extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare type: string

  @column()
  declare assetUrl: string

  @column()
  declare priceHoney: number
}
```

`app/models/user_cosmetic.ts` :
```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class UserCosmetic extends BaseModel {
  static table = 'user_cosmetics'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userPuuid: string

  @column()
  declare cosmeticId: string

  @column()
  declare equipped: boolean

  @column.dateTime({ autoCreate: true })
  declare purchasedAt: DateTime
}
```

- [ ] **Step 3: Seeder with 10 starter cosmetics**

`database/seeders/cosmetic_seeder.ts` :
```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import Cosmetic from '#models/cosmetic'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

const STARTERS = [
  { id: 'badge_iron', name: 'Iron Badge', type: 'badge', assetUrl: '/cosmetics/badge_iron.png', priceHoney: 100 },
  { id: 'badge_bronze', name: 'Bronze Badge', type: 'badge', assetUrl: '/cosmetics/badge_bronze.png', priceHoney: 200 },
  { id: 'badge_gold', name: 'Gold Badge', type: 'badge', assetUrl: '/cosmetics/badge_gold.png', priceHoney: 500 },
  { id: 'badge_diamond', name: 'Diamond Badge', type: 'badge', assetUrl: '/cosmetics/badge_diamond.png', priceHoney: 1500 },
  { id: 'border_blue', name: 'Hextech Blue Border', type: 'border', assetUrl: '/cosmetics/border_blue.png', priceHoney: 300 },
  { id: 'border_gold', name: 'Hextech Gold Border', type: 'border', assetUrl: '/cosmetics/border_gold.png', priceHoney: 800 },
  { id: 'glow_purple', name: 'Purple Glow', type: 'glow', assetUrl: '/cosmetics/glow_purple.png', priceHoney: 250 },
  { id: 'glow_red', name: 'Red Glow (toxic)', type: 'glow', assetUrl: '/cosmetics/glow_red.png', priceHoney: 250 },
  { id: 'badge_teemo', name: 'Teemo Badge', type: 'badge', assetUrl: '/cosmetics/badge_teemo.png', priceHoney: 1000 },
  { id: 'border_pentakill', name: 'Pentakill Border', type: 'border', assetUrl: '/cosmetics/border_pentakill.png', priceHoney: 2000 },
]

export default class CosmeticSeeder extends BaseSeeder {
  async run() {
    await Cosmetic.updateOrCreateMany('id', STARTERS)
  }
}
```

- [ ] **Step 4: Validator + Controller**

`app/validators/shop.ts` :
```ts
import vine from '@vinejs/vine'

export const purchaseValidator = vine.compile(
  vine.object({
    cosmeticId: vine.string().trim().minLength(1).maxLength(50),
  })
)
```

`app/controllers/shop_controller.ts` :
```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import Cosmetic from '#models/cosmetic'
import UserCosmetic from '#models/user_cosmetic'
import HoneyService from '#services/honey_service'
import { purchaseValidator } from '#validators/shop'

export default class ShopController {
  async list({ response }: HttpContext) {
    const items = await Cosmetic.all()
    return response.json({ items })
  }

  async owned({ auth, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) return response.status(409).json({ error: 'not_linked' })
    const owned = await UserCosmetic.query().where('userPuuid', user.riotPuuid)
    return response.json({ owned })
  }

  async purchase({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) return response.status(409).json({ error: 'not_linked' })
    const payload = await request.validateUsing(purchaseValidator)
    const cosmetic = await Cosmetic.find(payload.cosmeticId)
    if (!cosmetic) return response.status(404).json({ error: 'cosmetic_not_found' })

    const existing = await UserCosmetic.query()
      .where('userPuuid', user.riotPuuid)
      .where('cosmeticId', cosmetic.id)
      .first()
    if (existing) return response.status(409).json({ error: 'already_owned' })

    try {
      await HoneyService.debit(user.riotPuuid, cosmetic.priceHoney, 'cosmetic_purchase', {
        cosmetic_id: cosmetic.id,
      })
    } catch {
      return response.status(402).json({ error: 'insufficient_honey' })
    }
    const uc = await UserCosmetic.create({
      userPuuid: user.riotPuuid,
      cosmeticId: cosmetic.id,
      equipped: false,
    })
    return response.status(201).json({ ok: true, item: uc })
  }
}
```

- [ ] **Step 5: Routes**

```ts
const ShopController = () => import('#controllers/shop_controller')
router.get('/shop', [ShopController, 'list'])
router.get('/shop/owned', [ShopController, 'owned']).use(middleware.auth())
router.post('/shop/purchase', [ShopController, 'purchase']).use(middleware.auth())
```

- [ ] **Step 6: Webapp /shop page (minimal)**

`src/app/shop/page.tsx` :
```tsx
"use client";
import { useEffect, useState } from "react";
import { API_URL } from "@/lib/env";
import Button from "@/components/atoms/Button";

const TOKEN_KEY = "beemobot_token";

export default function ShopPage() {
  const [items, setItems] = useState<any[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [balance, setBalance] = useState<number>(0);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    fetch(`${API_URL}/shop`).then(r => r.json()).then(d => setItems(d.items));
    if (token) {
      fetch(`${API_URL}/shop/owned`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { owned: [] })
        .then(d => setOwned(new Set(d.owned.map((o: any) => o.cosmeticId))));
      fetch(`${API_URL}/economy/balance`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : { balance: 0 })
        .then(d => setBalance(d.balance));
    }
  }, []);

  const buy = async (cosmeticId: string) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const r = await fetch(`${API_URL}/shop/purchase`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cosmeticId }),
    });
    if (r.ok) {
      setOwned(new Set([...owned, cosmeticId]));
    } else {
      alert("Pas assez de honey 🍯");
    }
  };

  return (
    <main className="min-h-screen bg-[#0f1117] py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <header className="flex justify-between items-end mb-8">
          <h1 className="text-4xl font-bold text-white">🛒 Shop</h1>
          <p className="text-yellow-300 text-2xl">{balance} 🍯</p>
        </header>
        <div className="grid md:grid-cols-3 gap-4">
          {items.map((item) => {
            const isOwned = owned.has(item.id);
            return (
              <div key={item.id} className="bg-[#1a1d28] p-6 rounded-xl border border-gray-700/30 text-center">
                <h3 className="text-white font-bold mb-2">{item.name}</h3>
                <p className="text-yellow-300 text-xl mb-4">{item.priceHoney} 🍯</p>
                <Button
                  onClick={() => buy(item.id)}
                  disabled={isOwned || balance < item.priceHoney}
                  className={isOwned ? "bg-gray-600" : "bg-blue-600 hover:bg-blue-700"}
                >
                  {isOwned ? "Possédé" : "Acheter"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 7: Run migration + seeder + commit**

```bash
node ace migration:run
node ace db:seed
git add .
git commit -m "feat(api+webapp): cosmetics shop (10 starters)"
```

---

### Task 3.7 — Notification "+honey" sur DM après rep give

**Files:**
- Modify: `bot/Discord/Commands/rep_buttons.py`

- [ ] **Step 1: Update success message**

In the callback of `_btn` :

```python
async def callback(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)
    # ...
    result = await give_rep(payload)
    if result:
        gain = 10 if kind == "respect" else 5
        receiver_label = participant['championName']
        await interaction.followup.send(
            f"✅ {kind.title()} envoyé sur {receiver_label} (weight {result['weight']})\n"
            f"🍯 +{gain} honey crédité sur leur compte",
            ephemeral=True,
        )
        button.disabled = True
        await interaction.message.edit(view=self)
```

- [ ] **Step 2: Commit**

```bash
git add bot/Discord/Commands/rep_buttons.py
git commit -m "feat(bot): show honey gain in rep button feedback"
```

---

# Phase 4 — Polish & Soutenance (semaines 10-12)

**Definition of Done :** Le projet est démontrable et stable. CI verte. Doc utilisateur. Démo vidéo. Slide deck. Smoke automatisés.

---

### Task 4.1 — Admin command `/beemobot setup` (server config)

**Files:**
- Create: `database/migrations/*_create_guild_settings.ts`
- Create: `app/models/guild_setting.ts`
- Create: `app/controllers/admin_controller.ts`
- Create: `bot/Discord/Commands/setup_admin.py`

- [ ] **Step 1: Migration**

```bash
node ace make:migration create_guild_settings
```

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('guild_settings', (table) => {
      table.string('guild_id', 32).primary()
      table.boolean('rep_enabled').notNullable().defaultTo(true)
      table.string('public_channel_id', 32).nullable()
      table.timestamp('updated_at').defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable('guild_settings')
  }
}
```

- [ ] **Step 2: Model**

```ts
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GuildSetting extends BaseModel {
  static table = 'guild_settings'
  @column({ isPrimary: true })
  declare guildId: string
  @column()
  declare repEnabled: boolean
  @column()
  declare publicChannelId: string | null
}
```

- [ ] **Step 3: Admin controller**

```ts
import { HttpContext } from '@adonisjs/core/http'
import GuildSetting from '#models/guild_setting'

export default class AdminController {
  async getGuild({ params, response }: HttpContext) {
    const setting = await GuildSetting.find(params.guildId)
    return response.json(setting ?? { guildId: params.guildId, repEnabled: true, publicChannelId: null })
  }

  async updateGuild({ params, request, response }: HttpContext) {
    const { repEnabled, publicChannelId } = request.only(['repEnabled', 'publicChannelId'])
    await GuildSetting.updateOrCreate(
      { guildId: params.guildId },
      { repEnabled, publicChannelId }
    )
    return response.json({ ok: true })
  }
}
```

Routes :
```ts
const AdminController = () => import('#controllers/admin_controller')
router.get('/admin/guild/:guildId', [AdminController, 'getGuild'])
router.post('/admin/guild/:guildId', [AdminController, 'updateGuild'])
```

- [ ] **Step 4: Bot setup_admin.py**

```python
# Last updated: 2026-05-06
import discord
from discord import app_commands
from Discord.Commands.api_beemo import _request


def register_setup(bot):
    @bot.tree.command(name="setup", description="Admin: configure BeemoBot pour ce serveur")
    @app_commands.describe(
        enabled="Activer ou désactiver les DMs proactifs",
        channel="Channel public optionnel pour annoncer les events",
    )
    @app_commands.default_permissions(administrator=True)
    async def setup_cmd(
        interaction: discord.Interaction,
        enabled: bool = True,
        channel: discord.TextChannel | None = None,
    ):
        if not interaction.guild_id:
            await interaction.response.send_message("Commande serveur uniquement.", ephemeral=True)
            return
        result = await _request(
            "POST",
            f"/admin/guild/{interaction.guild_id}",
            json={
                "repEnabled": enabled,
                "publicChannelId": str(channel.id) if channel else None,
            },
        )
        if result:
            await interaction.response.send_message(
                f"✅ Config mise à jour. Rep: {'on' if enabled else 'off'}, "
                f"channel: {channel.mention if channel else 'aucun'}",
                ephemeral=True,
            )
        else:
            await interaction.response.send_message("❌ Échec.", ephemeral=True)
```

Wire in `global_commands.py`.

- [ ] **Step 5: Commit**

```bash
git add database/migrations app/models app/controllers start/routes.ts bot/Discord/Commands/setup_admin.py bot/Discord/Commands/global_commands.py
git commit -m "feat: server-level admin config (/setup)"
```

---

### Task 4.2 — Phantom rep claim flow

**Files:**
- Modify: `app/services/auth_service.ts`

- [ ] **Step 1: After link, count phantom events**

In `linkRiotAccount` after `user.save()` :

```ts
const phantomCount = await db
  .from('reputation_events')
  .where('receiver_puuid', account.puuid)
  .count('* as cnt')
const phantomTotal = Number(phantomCount[0].cnt ?? 0)

return response.json({
  puuid: account.puuid,
  gameName: account.gameName,
  tagLine: account.tagLine,
  phantomEvents: phantomTotal,
})
```

- [ ] **Step 2: Webapp shows phantom toast**

In `src/app/auth/link/page.tsx`, after success :

```tsx
const data = await res.json();
if (data.phantomEvents > 0) {
  alert(`🎉 Tu avais ${data.phantomEvents} events de réputation en attente — ils sont maintenant à toi !`);
}
router.push(`/u/${data.gameName}-${data.tagLine}`);
```

- [ ] **Step 3: Commit**

```bash
git add app/services/auth_service.ts src/app/auth/link
git commit -m "feat: phantom rep claim notification on linking"
```

---

### Task 4.3 — Caching Riot API responses (champion data, version)

**Files:**
- Create: `app/services/cache.ts`
- Modify: `app/services/riot_api_service.ts`

- [ ] **Step 1: Simple in-memory TTL cache**

```ts
/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

interface Entry<T> {
  value: T
  expiresAt: number
}

const STORE = new Map<string, Entry<any>>()

export default class Cache {
  static async memo<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const hit = STORE.get(key)
    if (hit && hit.expiresAt > now) return hit.value as T
    const value = await loader()
    STORE.set(key, { value, expiresAt: now + ttlSeconds * 1000 })
    return value
  }

  static invalidate(key: string) {
    STORE.delete(key)
  }
}
```

- [ ] **Step 2: Wrap Data Dragon calls**

In `riot_api_service.ts`, modify `getLatestVersion` and `getAllChampions` :

```ts
import Cache from '#services/cache'

async getLatestVersion(): Promise<string> {
  return Cache.memo('ddragon:latest', 3600, async () => {
    const url = `${RiotApiService.DDRAGON_BASE}/api/versions.json`
    const versions = (await fetch(url).then((r) => r.json())) as string[]
    return versions[0]
  })
}

async getAllChampions() {
  const version = await this.getLatestVersion()
  return Cache.memo(`ddragon:champions:${version}`, 3600, async () => {
    const data = await this.fetchDataDragon<{ data: Record<string, any> }>(`data/fr_FR/champion.json`)
    return data.data
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add app/services
git commit -m "perf(api): cache Data Dragon responses (1h TTL)"
```

---

### Task 4.4 — DB indexes audit

**Files:**
- Create: `database/migrations/*_add_perf_indexes.ts`

- [ ] **Step 1: Migration with the indexes that real-world queries reveal**

```ts
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('reputation_events', (table) => {
      table.index(['giver_puuid', 'receiver_puuid'], 'idx_rep_giver_receiver')
    })
    this.schema.alterTable('honey_ledger', (table) => {
      table.index(['user_puuid'], 'idx_honey_user')
    })
  }

  async down() {
    this.schema.alterTable('reputation_events', (t) => t.dropIndex([], 'idx_rep_giver_receiver'))
    this.schema.alterTable('honey_ledger', (t) => t.dropIndex([], 'idx_honey_user'))
  }
}
```

- [ ] **Step 2: Run + commit**

```bash
node ace migration:run
git add database/migrations
git commit -m "perf(api): add composite indexes for hot paths"
```

---

### Task 4.5 — CI workflow

**Files:**
- Create: `.github/workflows/ci.yml` (in chacun des 3 repos)

- [ ] **Step 1: API CI**

`beemobot-api/.github/workflows/ci.yml` :

```yaml
name: api-ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_DB: postgres
          POSTGRES_HOST_AUTH_METHOD: trust
        ports: ['5432:5432']
        options: --health-cmd pg_isready --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: cp .env.example .env && echo "APP_KEY=$(openssl rand -base64 32)" >> .env
      - run: node ace migration:run
      - run: pnpm typecheck
      - run: pnpm lint
      - run: node ace test functional
```

- [ ] **Step 2: Webapp CI**

```yaml
name: webapp-ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm tsc --noEmit
      - run: pnpm lint
      - run: pnpm build
```

- [ ] **Step 3: Bot CI (Python)**

```yaml
name: bot-ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r requirements.txt
      - run: python -m py_compile $(find . -name "*.py" -not -path "./node_modules/*")
```

- [ ] **Step 4: Commit each in their repo**

```bash
# in each repo
git add .github
git commit -m "ci: add GitHub Actions workflow"
```

---

### Task 4.6 — Documentation utilisateur

**Files:**
- Modify: `src/app/documentation/page.tsx`

- [ ] **Step 1: Rewrite content to reflect new product**

Sections : Quick start (link your account), Comment fonctionne la rep, Honey & shop, FAQ. Garder le composant existant, juste mettre à jour le texte.

- [ ] **Step 2: Commit**

```bash
git add src/app/documentation
git commit -m "docs(webapp): rewrite documentation page for new product"
```

---

### Task 4.7 — README polish (chaque projet)

**Files:**
- Modify: `beemobot-api/README.md`, `beemobot-webapp/README.md` (déjà refait), `bot/README.md`

- [ ] **Step 1: API README**

Cover : setup, env vars, scripts, database, links to spec/plan.

- [ ] **Step 2: Bot README**

Cover : Python venv, env vars, run bot, run worker, link to spec/plan.

- [ ] **Step 3: Commit each**

---

### Task 4.8 — Démo vidéo & slide deck

**Files:** N/A (livrables soutenance)

- [ ] **Step 1:** Script de démo : 1) link compte → 2) jouer game → 3) recevoir DM → 4) cliquer respect → 5) voir honey credit → 6) ouvrir leaderboard → 7) acheter cosmétique
- [ ] **Step 2:** Enregistrer (OBS) en 3 min max
- [ ] **Step 3:** Slide deck : problème, solution unique (rep prouvée), archi 3 services, démo vidéo, métriques, next steps

---

### Task 4.9 — Smoke test final automatisé

**Files:**
- Create: `tests/e2e/full_flow.spec.ts` (API)

- [ ] **Step 1: Test e2e qui couvre link → give → balance**

```ts
import { test } from '@japa/runner'
import User from '#models/user'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import ReputationEvent from '#models/reputation_event'

test.group('e2e: rep flow', (group) => {
  group.each.setup(async () => {
    await ReputationEvent.truncate(true)
    await HoneyLedgerEntry.truncate(true)
    await User.truncate(true)
  })

  test('full flow: linked giver gives respect, balance reflects credit', async ({ client, assert }) => {
    const giverPuuid = 'g'.repeat(78)
    const receiverPuuid = 'r'.repeat(78)
    await User.create({
      discordId: 'd1',
      email: 'a@b.fr',
      riotPuuid: giverPuuid,
      linkedAt: new Date() as any,
    })

    const giveRes = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid,
      matchId: 'EUW1_1',
      type: 'respect',
    })
    giveRes.assertStatus(201)

    const profileRes = await client.get(`/profile/${receiverPuuid}`)
    profileRes.assertStatus(200)
    const profile = profileRes.body()
    assert.equal(profile.counts.respects, 1)
    assert.equal(profile.honey, 10)
  })
})
```

- [ ] **Step 2: Run + commit**

```bash
node ace test functional --files full_flow
git add tests/e2e
git commit -m "test(api): full end-to-end rep flow"
```

---

# Self-review

**Spec coverage** : ✅ Tous les goals du spec ont au moins une tâche. Les non-goals sont effectivement absents (no monétisation, no modération, no multi-jeu).

**Placeholders** : Aucun "TBD" ou "TODO" laissé dans les tâches. Le seul "TBD" du spec (cosmétiques exacts) est résolu en Task 3.6 avec la liste de 10 starters.

**Type consistency** : Les noms de méthodes (`HoneyService.credit/debit/balance`, `RepService.giveRep/computeWeight/listEligibleMatches`) sont cohérents entre tâches. Les noms de tables (`reputation_events`, `honey_ledger`, `match_poll_state`, `dm_queue`, `cosmetics`, `user_cosmetics`, `guild_settings`) matchent entre migrations et models.

**Scope** : 4 phases de 3 semaines chacune. Chaque phase est shippable indépendamment (DoD claire). Total ~50 tâches, ~120-150h.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-beemobot-rep-system.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
