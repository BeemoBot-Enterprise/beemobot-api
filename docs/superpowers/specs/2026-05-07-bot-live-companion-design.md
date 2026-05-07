# Bot Live Companion — Design Spec

- **Date**: 2026-05-07
- **Status**: Approved for implementation
- **Repos impacted**: `beemobot-api` (3 endpoints + services), `bot` (3 slash commands)
- **Out of scope**: aucun polling, aucun DM auto, aucun appel à un LLM externe

## 1. Vue d'ensemble

Le bot Discord devient l'allié in-game du joueur via 3 commandes slash, toutes **à la demande** (pas de polling, pas de notification spontanée). L'utilisateur lance la commande quand il veut, le bot lit son `discord_id`, retrouve le compte Riot lié en base, interroge l'API Riot, et répond en message éphémère (visible uniquement par celui qui a tapé la commande).

| Commande | Quand | Ce qu'elle fait |
|---|---|---|
| `/live` | Pendant une game | Scout des 9 autres joueurs (rank, mastery, winrate sur le champ joué), threats, prédiction win% |
| `/predict` | Pendant une game | Juste la prédiction win% (plus rapide, moins d'appels Riot) |
| `/debrief` | Après une game | Analyse heuristique de la dernière game terminée + 3 verdicts |

L'effet "wahou" vient de la **densité** des données affichées au moment où l'utilisateur en a besoin, pas de la fréquence.

## 2. Scope

### Inclus

- 3 nouveaux endpoints API (`/lol/scout/by-discord/:id`, `/lol/predict/by-discord/:id`, `/lol/debrief/by-discord/:id`)
- 3 nouvelles commandes slash bot (`/live`, `/predict`, `/debrief`)
- 3 nouveaux services côté API (`live_scout_service.ts`, `predict_service.ts`, `debrief_service.ts`)
- Méthode `getActiveGameByPuuid()` sur `RiotApiService` (Spectator v5 — non implémenté à ce jour)
- Embeds Discord pour les 3 commandes (factory functions)
- Tests unitaires pour les algos `predict` et `debrief`

### Hors scope (pour cette spec)

- Aucun LLM (Claude, OpenAI…) — les algos sont des règles déterministes
- Pas de worker async ni de polling
- Pas de DM spontané du bot vers le joueur
- `/scout @user` (scout d'un autre membre) — sera traité dans une V2
- Bouton "Refresh" dans l'embed — l'utilisateur retape la commande
- Match Timeline v5 (positions/events frame-by-frame) — pas nécessaire pour les heuristiques bateau

## 3. Architecture

```
Discord user tape /live
        │
        ▼
bot Python (Discord.py)
        │  HTTP GET ${API_URL}/lol/scout/by-discord/{discord_id}
        ▼
beemobot-api (AdonisJS)
   ├─ lol_controller.scout()
   ├─ live_scout_service.scout(discordId)
   │       ├─ User.findBy('discordId', id) ──► 404 not_linked si !user.riotPuuid
   │       ├─ riotApi.getActiveGameByPuuid(puuid) ──► 404 not_in_game si Riot 404
   │       └─ pour chaque participant (Promise.all):
   │            ├─ getSummonerRank(puuid)              ┐
   │            ├─ getTopChampionMasteries(puuid, 5)   │ déjà implémentés
   │            └─ getMatchHistory(puuid, count=10)    │ + cache via Cache.memo
   │                + agrégation winrate sur champ joué┘
   └─ retourne payload JSON enrichi
        │
        ▼
bot reçoit JSON, formate via embed_factory, send_message(ephemeral=True)
```

Aucun nouveau worker, aucune nouvelle table, aucun nouveau pattern d'infra. Toute la logique vit dans des services testables unitairement.

## 4. Détail par commande

### 4.1 `/live` — Scout de la game en cours

**Endpoint API** : `GET /lol/scout/by-discord/:discordId`

**Réponse 200** :

```json
{
  "gameId": "EUW1_1234567890",
  "gameStartTime": 1715000000000,
  "gameLength": 184,
  "queueType": "RANKED_SOLO_5x5",
  "mapId": 11,
  "self": { "puuid": "...", "championName": "Jinx", "teamId": 100 },
  "teams": {
    "100": [
      {
        "puuid": "...",
        "championName": "Jinx",
        "summonerSpells": [4, 7],
        "rank": {
          "tier": "GOLD", "division": "II", "lp": 42,
          "wins": 38, "losses": 27, "hotStreak": false
        },
        "championMastery": { "level": 6, "points": 84210 },
        "championStats": { "games": 12, "wins": 7, "winPct": 58 }
      }
    ],
    "200": [ /* idem */ ]
  },
  "topThreats": [
    {
      "puuid": "...",
      "championName": "Vladimir",
      "reason": "Diamond II · 350k mastery · 61% WR sur Vlad"
    }
  ],
  "predictionWinPct": 48
}
```

**Réponses d'erreur** :

| Status | Body | Cas |
|---|---|---|
| 404 | `{"error": "not_linked"}` | Le `discord_id` existe mais pas de `riot_puuid` |
| 404 | `{"error": "not_in_game"}` | Riot Spectator a renvoyé 404 |
| 503 | `{"error": "riot_api_error"}` | Riot timeout / 5xx |

**Embed Discord côté bot** : titre "🔴 Game détectée", sections "🟦 Ton équipe" / "🟥 Adverse" listant chaque joueur sur une ligne, footer avec la prédiction. Format identique à celui présenté dans la session de brainstorming.

**Coût Riot par appel** :
- 1 Spectator v5
- 9 × 3 sub-calls (rank + mastery + match history) avec cache 5min
- ≈ 28 req Riot pour un cache miss complet, ≈ 0-5 req si les opposants sont déjà en cache

### 4.2 `/predict` — Prédiction win% rapide

**Endpoint API** : `GET /lol/predict/by-discord/:discordId`

**Réponse 200** :

```json
{
  "gameId": "EUW1_1234567890",
  "self": { "teamId": 100 },
  "teamScores": { "100": 22.4, "200": 28.1 },
  "diff": -5.7,
  "winPct": 36,
  "explanation": "Équipe adverse ~1 division au-dessus en moyenne."
}
```

**Algorithme** :

```ts
const TIER_VALUE: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5,
  DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9
}
const DIV_VALUE: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }

function rankScore(tier: string, division: string, hotStreak: boolean,
                   masteryPoints: number): number {
  const base = TIER_VALUE[tier] * 4 + DIV_VALUE[division]
  return base + (hotStreak ? 2 : 0) + (masteryPoints > 100_000 ? 1 : 0)
}

function predictWinPct(myTeamAvg: number, oppTeamAvg: number): number {
  const diff = myTeamAvg - oppTeamAvg
  const adjusted = 50 + Math.max(-35, Math.min(35, diff * 2.5))
  return Math.round(adjusted)
}
```

Si un participant est unranked (pas de soloQ rank en League v4) → score = 8 (équivalent Silver IV) par défaut, et flag `unranked: true` dans l'output (l'embed l'indique).

**Génération de `explanation`** : on dérive du `diff` brut un message court via une table simple (`diff > 8` → "tu es nettement favorisé", `diff > 4` → "léger avantage", `|diff| ≤ 4` → "match équilibré", `diff < -4` → "léger désavantage", `diff < -8` → "équipe adverse nettement plus forte"). Pas de formulation libre.

**Coût Riot** : 1 Spectator + 9 × 1 League v4 (cache 5min) = max 10 req.

### 4.3 `/debrief` — Analyse de la dernière game

**Endpoint API** : `GET /lol/debrief/by-discord/:discordId`

**Réponse 200** :

```json
{
  "matchId": "EUW1_1234567890",
  "championName": "Jinx",
  "queueType": "RANKED_SOLO_5x5",
  "win": false,
  "durationMin": 28,
  "stats": {
    "kda": 1.6,
    "csPerMin": 7.2,
    "goldPerMin": 412,
    "visionPerMin": 0.64,
    "damageRatio": 2.1,
    "killParticipation": 0.42
  },
  "verdicts": [
    { "severity": "red", "msg": "Tu es mort plus que tu as contribué (KDA 1.6) — focus survie" },
    { "severity": "yellow", "msg": "Vision insuffisante (0.6/min — vise 1+)" },
    { "severity": "green", "msg": "Bon ratio dégâts/or (2.1)" }
  ],
  "score": "C+"
}
```

**Sources de données** : `Match v5` uniquement (déjà implémenté). Tous les champs proviennent du `participants[]` payload du match :

- `kda`, `csPerMin`, `goldPerMin`, `visionPerMin` se calculent depuis `kills`, `deaths`, `assists`, `totalMinionsKilled + neutralMinionsKilled`, `goldEarned`, `visionScore`, `timePlayed`
- `damageRatio = totalDamageDealtToChampions / goldEarned`
- `killParticipation` est directement disponible dans `participants[].challenges.killParticipation` (valeur 0-1)

**Pas besoin de Match Timeline v5** — les heuristiques retenues n'ont pas besoin de données frame-by-frame.

**Heuristiques (table de règles)** :

| Critère | Seuil | Severity | Message |
|---|---|---|---|
| KDA | < 1.0 | red | "🔴 Tu es mort plus que tu as contribué — focus survie" |
| KDA | > 4.0 ET win | green | "🟢 Carry-game propre 👏" |
| CS/min lane | < 5 | yellow | "🟡 Farm en dessous du standard rank — pratique CS en custom" |
| CS/min jungle | < 4 | yellow | "🟡 Farm jungle bas — clean tes camps plus vite" |
| CS/min | > 8 (lane) | green | "🟢 Excellent farm" |
| Vision/min | < 1 | yellow | "🟡 Pas assez de vision — pose tes wards en sortant de base" |
| `damageRatio` | > 2.5 | green | "🟢 Excellent dmg/gold — tu as bien valorisé ton or" |
| `damageRatio` | < 1.0 (carry) | yellow | "🟡 Peu de dégâts pour ton rôle" |
| `killParticipation` | > 0.7 ET win | green | "🟢 Très impliqué dans les fights" |
| `killParticipation` | < 0.3 | yellow | "🟡 Peu impliqué — colle ton équipe en mid-game" |

**Score global** : moyenne pondérée des critères (red = 0, yellow = 5, green = 10), normalisée sur 100, mappée sur lettres A+/A/B+/B/C+/C/D/F.

**Sélection des 3 verdicts à afficher** : priorité red > yellow > green, et si plusieurs verdicts d'une même severity, on prend ceux dont l'écart au seuil est le plus grand.

**Coût Riot** : 1 Match v5 history (1 req) + 1 Match details (1 req) = 2 req max.

## 5. Endpoints Riot utilisés

| API | Endpoint | Statut actuel | Cache |
|---|---|---|---|
| Spectator v5 | `/lol/spectator/v5/active-games/by-summoner/{puuid}` | **À ajouter** dans `RiotApiService` | aucun (pas pertinent — change toutes les minutes) |
| League v4 | `/lol/league/v4/entries/by-puuid/{puuid}` | déjà implémenté | 5 min |
| Mastery v4 | `/lol/champion-mastery/v4/champion-masteries/by-puuid/{puuid}/top` | déjà implémenté | 1 h |
| Match v5 | `/lol/match/v5/matches/by-puuid/{puuid}/ids` + `/matches/{matchId}` | déjà implémenté | 5 min sur ids list, immutable sur les détails |

**Méthode à ajouter** dans `riot_api_service.ts` :

```ts
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

## 6. Modèle de données

**Aucun changement**. La table `users` contient déjà `discordId`, `riotPuuid`, `riotGameName`, `riotTagLine`, `linkedAt`. Les services lookup par `discordId` et utilisent le `puuid` pour parler à Riot.

## 7. Cache & rate limiting

**Cache Riot** : on réutilise `Cache.memo(key, ttl, fn)` déjà présent dans `riot_api_service.ts`. Clés et TTL :

- `riot:rank:${puuid}` → TTL 300s (5 min)
- `riot:masteries:${puuid}:top:5` → TTL 3600s (1 h)
- `riot:match:${matchId}` → TTL aucune limite (un match terminé est immuable, mais on garde 24h pour libérer la mémoire)

**Anti-flood par utilisateur** : on ajoute une protection simple au niveau du controller — si le même `discordId` appelle `/lol/scout/by-discord/:id` deux fois en moins de 15 secondes, on retourne le **résultat précédent en cache** (cache local en mémoire dans `live_scout_service`, clé = `discordId`). Pas de 429, juste un cache hit.

**Pas de rate limit Riot global** côté API. La dev key Riot (20 req/s, 100 req / 2 min) est suffisante car les appels sont à la demande utilisateur, pas en boucle.

## 8. Error handling

| Cas | Comportement API | Comportement bot |
|---|---|---|
| Discord ID inconnu en DB | 404 `not_linked` | "❌ Tu n'es pas lié — utilise `/link`" |
| User sans `riot_puuid` | 404 `not_linked` | idem |
| Spectator 404 (pas en game) | 404 `not_in_game` | "❌ Tu n'es pas en game actuellement" |
| Match v5 vide (pas de match récent) | 404 `no_recent_match` | "❌ Aucune game récente trouvée" |
| Riot 5xx ou timeout | 503 `riot_api_error` | "⚠️ L'API Riot est lente, réessaie dans 30s" |
| Riot 401/403 (clé expirée) | 502 `riot_auth_failed` + log error | "⚠️ Souci de configuration côté serveur, signale-le à l'admin" |

Côté bot, toutes les erreurs sont envoyées en `ephemeral=True` pour ne pas polluer le serveur.

## 9. Tests

### Unitaires (Vitest, déjà en place pour les autres services)

- `tests/unit/predict_service.spec.ts`
  - score d'un Diamond II = 26
  - score d'un unranked = 8
  - hot streak ajoute 2
  - mastery > 100k ajoute 1
  - clamp à ±35 sur le diff
  - winPct toujours ∈ [15, 85]

- `tests/unit/debrief_service.spec.ts`
  - KDA < 1.0 produit un verdict red
  - 3 verdicts retournés max, priorité red > yellow > green
  - score global cohérent avec les seuils
  - cas "win avec KDA 7" → verdict green carry-game

### Intégration (mock Riot)

- `tests/functional/lol_scout.spec.ts`
  - GET `/lol/scout/by-discord/:id` avec `discord_id` non lié → 404 not_linked
  - GET avec `discord_id` lié mais pas en game (mock Spectator 404) → 404 not_in_game
  - GET avec `discord_id` lié et en game → 200 avec les 9 participants enrichis
  - Cache hit du même appel < 15s plus tard → pas de re-fetch Riot

### Côté bot

Les tests bot sont en deçà du scope (le bot n'a pas de framework de test installé actuellement). Test manuel à la première implémentation : un user lié lance une partie, tape `/live`, valide visuellement l'embed.

## 10. Fichiers impactés

### `beemobot-api`

| Fichier | Action |
|---|---|
| `app/services/riot_api_service.ts` | **modif** — ajout de `getActiveGameByPuuid` |
| `app/services/live_scout_service.ts` | **création** |
| `app/services/predict_service.ts` | **création** |
| `app/services/debrief_service.ts` | **création** |
| `app/controllers/lol_controller.ts` | **modif** — ajout de `scout`, `predict`, `debrief` |
| `start/routes.ts` | **modif** — 3 routes ajoutées |
| `tests/unit/predict_service.spec.ts` | **création** |
| `tests/unit/debrief_service.spec.ts` | **création** |
| `tests/functional/lol_scout.spec.ts` | **création** |

### `bot`

| Fichier | Action |
|---|---|
| `Discord/Commands/live.py` | **création** |
| `Discord/Commands/predict.py` | **création** |
| `Discord/Commands/debrief.py` | **création** |
| `Discord/Commands/global_commands.py` | **modif** — register des 3 commandes |
| `Discord/Commands/api_beemo.py` | **modif** — wrappers `get_scout`, `get_predict`, `get_debrief` |
| `Discord/Commands/embed_factory.py` | **modif** — `embed_scout`, `embed_predict`, `embed_debrief` |
| `Discord/Commands/help.py` | **modif** — documenter les 3 nouvelles commandes |

## 11. Suite (post-MVP)

Une fois cette première itération en place et démontrable, voici les axes d'extension naturels (chacun = sa propre spec) :

1. **`/scout @user`** — scouter un autre membre Discord (qui doit être lié) avant qu'il lance une game
2. **Annonces serveur** — quand un membre fait quelque chose de notable (penta, 10 wins d'affilée, jump de division), poster dans un salon `#highlights`
3. **Match Timeline v5** — pour des debriefs plus fins (positions, kills clés, gold curve)
4. **Bouton interactif "🔄 Refresh"** sur l'embed `/live` — re-fetch sans retaper la commande
5. **`/duel @user`** — challenger un autre membre, le bot suit les ranked des deux suivantes et déclare un winner

Aucun de ces axes n'est nécessaire pour démontrer le concept en soutenance.
