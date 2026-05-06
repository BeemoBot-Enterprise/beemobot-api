# BeemoBot — Écosystème

Plateforme communautaire **League of Legends** gamifiée autour de Discord. Trois projets sœurs travaillent ensemble : un bot Discord, une API REST, et un site web.

> Ce CLAUDE.md est **identique dans les 3 projets**. Utilise-le comme carte pour naviguer entre eux.

## Carte des projets

Tous les projets vivent dans `/Users/jeremy/Documents/Code/ynov/ydays/`.

| Projet | Path absolu | Stack | Rôle |
|---|---|---|---|
| **bot** | `/Users/jeremy/Documents/Code/ynov/ydays/bot` | Python 3 · discord.py · riotwatcher | Bot Discord — slash commands, interface utilisateur |
| **beemobot-api** | `/Users/jeremy/Documents/Code/ynov/ydays/beemobot-api` | AdonisJS 6 · PostgreSQL · Lucid | API REST — source de vérité, proxy Riot, OAuth Discord |
| **beemobot-webapp** | `/Users/jeremy/Documents/Code/ynov/ydays/beemobot-webapp` | Next.js 15 · React 19 · Tailwind · Three.js · Framer Motion | Site — landing, profil, recherche, mini-jeux |

Pour sauter d'un projet à l'autre : `Read /Users/jeremy/Documents/Code/ynov/ydays/<projet>/<fichier>`.

## Schéma de communication

```
   ┌──────────────────┐                    ┌──────────────────┐
   │   bot (Discord)  │                    │  webapp (Next)   │
   │  Python          │                    │  React 19 / SSR  │
   └────────┬─────────┘                    └────────┬─────────┘
            │ HTTP                                   │ HTTP + OAuth
            │ /game/*                                │ /auth/* /lol/* /game/*
            └─────────────────┬──────────────────────┘
                              ▼
                  ┌──────────────────────────┐
                  │ beemobot-api (AdonisJS)  │
                  │ PostgreSQL · Lucid       │
                  └────────────┬─────────────┘
                               │ HTTP
                               ▼
                       ┌────────────────┐
                       │  Riot API +    │
                       │  Data Dragon   │
                       └────────────────┘
```

## API — endpoints publics (résumé)

Base URL : `http://localhost:3333` (dev) · `https://api.beemobot.fr` (prod)

- **Auth Discord** : `GET /auth/discord/redirect`, `GET /auth/discord/callback`
- **Game** (sans auth, consommé par le bot) :
  - `POST /game/shroom` `{username}` — incrémente shrooms
  - `POST /game/respect` `{username}` — incrémente respects
  - `GET /game/stats/:username` — stats user
  - `GET /game/top/shrooms`, `GET /game/top/respects` — leaderboards
- **LoL** (proxy Riot + Data Dragon) :
  - `GET /lol/version`, `/lol/champions`, `/lol/champion/:name`, `/lol/items`
  - `GET /lol/summoner/:gameName-:tagLine[/profile|/rank|/masteries|/matches]`
  - `GET /lol/match/:matchId`
  - **Format Riot ID** : `GameName-TagLine` (tiret) ou query `?tagLine=XXX&region=euw1`

Doc exhaustive : `beemobot-api/API.md` (66 KB).

## État actuel — mai 2026

### bot — Python Discord bot
- Entry : `main.py` → `Discord/bot.py` (`commands.Bot` + slash sync)
- Commandes implémentées : `/user`, `/shroom`, `/respect`, `/lastgame`, `/runes`, `/top_shrooms`, `/top_respects`, `/help_orion`
- Régions : `EUW EUNE NA BR JP KR LA LAS OC TR RU`
- Riot API via `riotwatcher` (`Riot/riot_watcher.py`, helpers `Riot/riot_toolbox.py`)
- Wrapper API Beemo : `Discord/Commands/api_beemo.py` (POST shroom/respect, GET stats/top)
- Embeds Discord : `Discord/Embeds_Factory/embed_factory.py`
- Logs : `Logs/logs_holder/bot.log` (rotation manquante)
- Vérif env au boot : `Verification/verification.py` exige `BOT_TOKEN_TEST` et `RIOT_API_KEY`
- Lancement : `python main.py` — utilise `BOT_TOKEN_TEST` (mode dev)
- Encodage `requirements.txt` : **UTF-16 LE** (attention si lecture)

### beemobot-api — AdonisJS 6
- 8 migrations appliquées : `users`, `auth_access_tokens`, `shrooms`, `reports`, `respects`, `champions`, modify username, riot fields
- Modèles : `User` (champs Discord + Riot), `Shroom`, `Respect`
- Auth Discord OAuth via `@adonisjs/ally` ; Riot OAuth **commenté** (env vars optionnelles)
- Service Riot complet : `app/services/riot_api_service.ts` (Account/Summoner/League/Mastery/Match v5)
- Tous les endpoints LoL testés live mai 2026 avec `Nunch#N7789` ✅
- Seeder `user_seeder` : crée `john.doe@beemobpt-entreprise.fr`
- Stack DB : PostgreSQL local (port 5432, user `postgres`)
- Scripts : `pnpm dev` (port 3333, HMR), `pnpm build`, `node ace migration:run`, `node ace db:seed`
- Doc API : `API.md`

### beemobot-webapp — Next.js 15 (App Router)
- Atomic Design : `src/components/{atoms,molecules,organisms,templates}/`
- Pages : `/` (landing), `/auth/callback`, `/profile`, `/search`, `/game`, `/documentation`, `/resources`
- Hooks : `useAuth`, `useGameState`, `useLocalStorage`, `useParallax`, `useScrollAnimation`, `useCountUp`
- Store : `src/lib/store/{token,user}.ts` (token + user persistés)
- Auth flow : `useAuth.login()` → redirige `${API_URL}/auth/discord/redirect` → `/auth/callback` reçoit le token
- Mini-jeux : `DodgeSkillshotGame`, `GuessChampionGame`, `LoLTriviaGame`, `MemoryMatchGame`, `TeemoMinesweeper`
- Sections landing : `EpicHeroSection`, `FeatureShowcase`, `StatsSection`, `MinigamesPreview`, `TestimonialsSection`, `CTASection`, `SponsorsSection`
- Three.js (`@react-three/fiber` + drei), Framer Motion, particules, hexagones
- `next.config.mjs` injecte `API_URL` (actuellement ngrok) et `BOT_INVITE_URL`
- Scripts : `pnpm dev` (port 3000), `pnpm build`, `pnpm start`

## Conventions partagées

- **Copyright header** : tous les fichiers TS/Python portent `Copyright (c) 2024-2026 BeemoBot Enterprise / All rights reserved.` — ne pas retirer
- **Username en DB** : format `name_tag` (underscore), pas `name#tag`. Concat faite côté bot avant `POST /game/*`
- **Région Riot** : helpers `region_real_name` / `region_to_routing` côté bot ; côté API c'est dans `lol_controller.ts` et `riot_api_service.ts`
- **Date / time** : Luxon côté API ; `datetime` ISO côté bot

## Workflow type — exemple `/shroom`

1. User tape `/shroom Nunch N7789 EUW` sur Discord
2. `bot/Discord/Commands/global_commands.py` reçoit la commande
3. `bot/Riot/riot_watcher.py` valide l'identité via Riot API
4. `bot/Discord/Commands/api_beemo.py` → `POST https://api.beemobot.fr/game/shroom`
5. `beemobot-api/app/controllers/game_controller.ts` incrémente en DB
6. Le webapp affichera le score via `/profile` ou les leaderboards `/search`

## Pièges connus

- **Clé Riot dev expire toutes les 24h** → renouveler sur https://developer.riotgames.com/
- `RIOT_CLIENT_ID` / `RIOT_CLIENT_SECRET` côté API sont **optionnels** (OAuth Riot désactivé dans `config/ally.ts`)
- `next.config.mjs:env.API_URL` pointe sur une **URL ngrok** — à modifier en local pour pointer sur `http://localhost:3333`
- Le bot tourne par défaut en `BOT_TOKEN_TEST`, **pas prod** (cf. `main.py:11`)
- `requirements.txt` du bot est encodé **UTF-16 LE** (ne pas lire avec `cat` simple, utiliser `iconv -f UTF-16`)

## Identifiants & URLs utiles

- API prod : `https://api.beemobot.fr`
- Discord bot invite : `https://discord.com/oauth2/authorize?client_id=1316056047936471133&permissions=8&scope=bot`
- Discord callback (dev) : `http://localhost:3333/auth/discord/callback`
- Riot callback (dev, désactivé) : `http://localhost:3333/auth/riot/callback`
