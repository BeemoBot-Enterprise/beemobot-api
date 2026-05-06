# BeemoBot — API

AdonisJS 6 backend for the BeemoBot reputation system. Source of truth for users, reputation events, honey ledger, and the worker queue.

Companion projects: [`bot`](../bot) (Discord) · [`beemobot-webapp`](../beemobot-webapp) (Next.js).

## Stack

- AdonisJS 6 + Lucid (Postgres)
- VineJS validators
- Japa for tests
- Pino structured logging

## Setup

```bash
pnpm install
cp .env.example .env             # then fill all values
node ace migration:run           # apply schema
node ace db:seed                 # cosmetics + demo user
pnpm dev                         # http://localhost:3333
```

## Env

| Var | Purpose |
|---|---|
| `APP_KEY` | AdonisJS encryption secret (32 bytes base64) |
| `DB_*` | Postgres connection |
| `DISCORD_CLIENT_ID` / `_SECRET` / `_CALLBACK_URL` | Discord OAuth |
| `RIOT_API_KEY` | Riot API access key |
| `WEBAPP_URL` | Used to redirect post-OAuth |
| `ALLOWED_ORIGINS` | CORS whitelist (comma-separated) |
| `INTERNAL_API_KEY` | Shared secret for service-to-service calls (e.g. webapp `/economy/credit`) |

## Scripts

| Command | Action |
|---|---|
| `pnpm dev` | HMR dev server on :3333 |
| `pnpm build` / `pnpm start` | Production build |
| `pnpm typecheck` / `pnpm lint` | Static checks |
| `node ace test functional` | Japa functional tests |
| `node ace migration:run` / `db:seed` | DB lifecycle |

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/link` | Auth — link Discord ↔ Riot |
| GET | `/auth/discord/redirect` / `/callback` | Discord OAuth |
| GET | `/profile/me` / `/profile/by-discord/:id` / `/profile/:puuid` | Profile views |
| GET | `/rep/eligible?giverPuuid=&receiverPuuid=` | List shared matches available |
| POST | `/rep/give` | Create a rep event (server-to-server) |
| GET | `/economy/balance` | Auth — current honey + recent ledger + daily honey |
| POST | `/economy/spend` / `/economy/credit` | Auth / internal-key |
| GET | `/leaderboard?period=&type=&scope=` | Trending Hall of Fame |
| GET | `/shop` / `/shop/owned` / POST `/shop/purchase` | Cosmetics |
| GET / POST | `/admin/guild/:id` | Per-server config |
| GET | `/lol/*` | Riot proxy (champions, items, summoner, match) |

Full API doc: [`API.md`](API.md).

## Architecture

- `app/services/rep_service.ts` — central rep give logic + weight formula
- `app/services/honey_service.ts` — append-only ledger (credit / debit / balance)
- `app/services/leaderboard_service.ts` — aggregations
- `app/services/riot_api_service.ts` — Riot API + Data Dragon (cached)

## Documentation

- [Spec](docs/superpowers/specs/2026-05-06-beemobot-rep-system-design.md) — product design
- [Plan](docs/superpowers/plans/2026-05-06-beemobot-rep-system.md) — implementation plan (4 phases)
- [SMOKE-PHASE1](docs/superpowers/specs/SMOKE-PHASE1.md) / [SMOKE-PHASE2](docs/superpowers/specs/SMOKE-PHASE2.md) — manual e2e checklists

## License

Copyright (c) 2024-2026 BeemoBot Enterprise. All rights reserved.
