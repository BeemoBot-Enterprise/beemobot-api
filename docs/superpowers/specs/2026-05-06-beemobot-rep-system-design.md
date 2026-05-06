# BeemoBot — Refonte Reputation System

**Date** : 2026-05-06
**Status** : Spec — pending implementation plan
**Scope** : touches `beemobot-api`, `bot`, `beemobot-webapp`
**Timeline** : ~3 mois (ydays Ynov)

---

## 1. Contexte

BeemoBot est aujourd'hui un assemblage de 3 projets sœurs (`bot` Python · `beemobot-api` AdonisJS · `beemobot-webapp` Next.js) qui poussent en parallèle 3 propositions de valeur :

- un système de réputation `/shroom` `/respect` (compteurs anonymes par username, sans contexte)
- un data tool LoL classique (recherche invocateur, stats, ranks, masteries)
- des mini-jeux côté webapp (5 jeux, déconnectés du bot)

Aucun des trois n'est différenciant pris isolément (op.gg fait mieux pour B, des dizaines de bots font des mini-jeux pour C). Le seul angle unique est **la réputation peer-to-peer**, mais elle est aujourd'hui un compteur trivial vulnérable au spam, sans contexte social.

## 2. Goals & Non-goals

**Goals**

- Faire de la réputation peer-to-peer le **cœur du produit**, avec preuve de match et garde-fous solides
- Mettre les stats Riot et les mini-jeux **au service de la réputation**, pas comme des features parallèles
- Construire un produit cohérent avec un **effet de réseau global** (la rep traverse les serveurs)
- Webapp transformé en **destination** (profil partageable + Hall of Fame + économie)

**Non-goals (v1)**

- Pas de monétisation (premium, ads)
- Pas de modération communautaire (signalements, votes — peuvent être ajoutés plus tard)
- Pas de support multi-jeu (LoL only, pas TFT/Valorant pour l'instant)
- Pas de mobile app native (le webapp reste responsive)
- Pas de système de "guildes" ou clans cross-Discord

## 3. Vision

> *BeemoBot transforme tes games LoL en expérience sociale. Tu joues, tes coéquipiers et adversaires t'ont vu, ils peuvent te juger — un shroom si t'as fed, un respect si t'as carry. Ta réput' te suit partout : sur ton profil partageable, dans le Hall of Fame mondial, dans les mini-jeux où ton honey de rep te paie l'entrée.*

## 4. Règles produit (lockées)

### 4.1 Distribution de réputation

- Deux types d'événements : **shroom** 🍄 (négatif) et **respect** ⭐ (positif)
- Tu ne peux donner shroom/respect à un user **que si vous étiez ensemble dans un match Riot** (allié OU adverse — match-wide, pas team-only)
- **Quota strict par match commun** : 1 shroom max + 1 respect max par paire (giver, receiver, match)
- Les compteurs reçus sont **immuables** (jamais décrémentés) — c'est un signal social pur
- **Pas de decay** dans le compteur ; la fraîcheur s'exprime via des leaderboards trending (this week / this month / all-time)

### 4.2 Système de poids

Chaque event a un `weight` calculé au moment de la création, basé sur la rep nette du **giver** :

```
net_rep      = giver.respects_received - giver.shrooms_received
weight       = 1.0 + min(1.0, max(0, net_rep) / 50.0)
```

Soit un multiplier entre **1.0 et 2.0**, atteint le max à `net_rep ≥ 50`. Un giver avec une rep négative ou zéro reste à 1.0 (pas de poids inversé pour ne pas amplifier les voix négatives).

Les compteurs affichés sont alors des **sommes pondérées** (pas des counts simples).

### 4.3 Identité

- **Giver** : doit avoir lié son compte Discord à son compte Riot via le webapp (one-time). Sans link, pas de give possible. Le link expose `discord_id ↔ riot_puuid` dans la table `users`.
- **Receiver** : un Riot ID quelconque (`gameName + tagLine`). Il n'a pas besoin d'avoir utilisé le bot — sa rep "fantôme" s'accumule sur son `puuid` et lui sera attribuée quand il liera son Discord (claim flow).

### 4.4 Scope global vs serveur

- La donnée est **stockée globale** (pas de duplication par guild)
- Chaque event porte un `guild_id` indicatif (le Discord d'où il a été déclenché — pour les leaderboards filtrables par serveur, ou `NULL` si l'event vient du webapp ou d'un DM)
- **Définition du "leaderboard serveur"** (v1) : events où `guild_id = ?` (filtre simple sur la table). Cela exclut les events DM/webapp même pour des users membres du serveur — accepté pour le MVP. Une v2 pourrait synchroniser les guild memberships pour faire un leaderboard "users membres de ce serveur, peu importe d'où viennent les events".
- Affichage par défaut sur Discord : leaderboard **du serveur** ; sur webapp : leaderboard **global**
- Un user peut consulter le leaderboard global depuis Discord via une commande explicite

### 4.5 Économie honey 🍯

Devise dépensable, dérivée de la rep. Les compteurs shroom/respect ne baissent **jamais**. Honey est créditée/débitée dans une table append-only `honey_ledger`.

| Source | Crédit |
|---|---|
| 1 respect reçu | +10 honey |
| 1 shroom reçu | +5 honey ("rage compensation") |
| Daily login (premier appel d'une commande de la journée) | +20 honey |
| Victoire mini-jeu | variable (5-50 selon le jeu) |
| Défaite mini-jeu | 0 (la mise est perdue) |

| Dépense | Coût |
|---|---|
| Pari mini-jeu | 5-100 honey (selon jeu, choix du user) |
| Cosmétique (badge, border profil, glow) | 100-1000 honey |

Le solde live est dérivé d'`SUM(delta) FROM honey_ledger WHERE user_puuid = ?`. Pas de denormalisation pour le MVP.

## 5. Architecture

### 5.1 Data model

Toutes les nouvelles tables vivent dans la DB Postgres existante de `beemobot-api`. Migrations Lucid.

**`users` (existante, à étendre)**
```
+ honey_balance     int (cached, optional — peut être dérivé)
+ linked_at         timestamp nullable (NULL = pas linked)
+ last_daily_at     date nullable (pour daily honey)
```

**`reputation_events` (nouvelle, remplace `shrooms` + `respects`)**
```
id              bigserial PK
type            varchar(10) NOT NULL CHECK (type IN ('shroom','respect'))
giver_puuid     varchar(128) NOT NULL  -- toujours linked
receiver_puuid  varchar(128) NOT NULL  -- peut être un fantôme
guild_id        varchar(32) NULL       -- Discord guild id, NULL si webapp
match_id        varchar(64) NOT NULL   -- ex: "EUW1_7843405784"
weight          decimal(3,2) NOT NULL  -- ex: 1.42
reason          text NULL              -- optionnel, free-form (max 200)
created_at      timestamp NOT NULL DEFAULT NOW()

UNIQUE (giver_puuid, receiver_puuid, match_id, type)
INDEX (receiver_puuid, type)
INDEX (created_at DESC)
INDEX (guild_id, created_at DESC)
```

**`honey_ledger` (nouvelle, append-only)**
```
id              bigserial PK
user_puuid      varchar(128) NOT NULL
delta           int NOT NULL          -- signed
reason          varchar(50) NOT NULL  -- 'respect_received', 'shroom_received',
                                      -- 'daily_login', 'minigame_win',
                                      -- 'minigame_bet', 'cosmetic_purchase'
metadata        jsonb NULL            -- { match_id, mini_game_id, cosmetic_id, ... }
created_at      timestamp NOT NULL DEFAULT NOW()

INDEX (user_puuid, created_at DESC)
```

**`match_poll_state` (nouvelle, état du worker)**
```
user_puuid              varchar(128) PK
last_polled_match_id    varchar(64) NULL
last_polled_at          timestamp NOT NULL
```

**`dm_queue` (nouvelle, queue simple)**
```
id              bigserial PK
discord_id      varchar(32) NOT NULL
match_id        varchar(64) NOT NULL
participants    jsonb NOT NULL        -- liste des autres participants linked + leurs stats
status          varchar(20) NOT NULL  -- 'pending', 'sent', 'failed'
attempts        int NOT NULL DEFAULT 0
created_at      timestamp NOT NULL
sent_at         timestamp NULL
last_error      text NULL

INDEX (status, created_at)
```

### 5.2 Composants

```
                        ┌──────────────────────────┐
                        │   beemobot-api (Adonis)  │
                        │   /auth/link             │
                        │   /rep/give              │
                        │   /profile/:puuid        │
                        │   /leaderboard           │
                        │   /economy/balance       │
                        │   /economy/spend         │
                        │   /lol/* (existant)      │
                        └────────┬─────────────────┘
                                 │ Postgres
   ┌─────────────────────────────┼──────────────────────────┐
   │                             │                          │
┌──▼───────────────┐    ┌────────▼────────┐    ┌────────────▼─────────┐
│  Discord Bot     │    │  Match Worker   │    │  beemobot-webapp     │
│  (Python)        │    │  (Python cron)  │    │  (Next.js)           │
│                  │    │                 │    │                      │
│  /link, /me,     │    │  poll Riot →    │    │  /u/[riotId]  pub    │
│  /judge,         │    │  insert dm_queue│    │  /leaderboard        │
│  /lastgame,      │    │                 │    │  /games (mini-jeux)  │
│  DM consumer     │    └─────────────────┘    │  /shop (cosmétiques) │
│  (poll dm_queue) │                           │  /auth/link          │
└──────────────────┘                           └──────────────────────┘
```

### 5.3 Match Worker — flow détaillé

Tous les `WORKER_INTERVAL_MS` (par défaut 5 min, configurable env) :

1. `SELECT user_puuid, last_polled_match_id FROM match_poll_state JOIN users USING(puuid) WHERE users.linked_at IS NOT NULL`
2. Pour chaque user, **GET** Riot match history (10 dernières matchs)
3. Liste des matchs **nouveaux** = matchs avant `last_polled_match_id`
4. Pour chaque nouveau match : **GET** match details (avec backoff sur 429)
5. Identifier les autres participants linked (jointure `puuid IN (SELECT riot_puuid FROM users)`)
6. Pour chaque user linked du match (incluant celui qu'on poll) : **INSERT INTO dm_queue** un job avec la liste des autres participants + leurs stats clés (champion, K/D/A, win/lose)
7. Dedup : `UNIQUE INDEX (discord_id, match_id)` sur `dm_queue` pour éviter les doublons si deux users linked du même match déclenchent le poll
8. `UPDATE match_poll_state SET last_polled_match_id = ?, last_polled_at = NOW()`

**Quotas Riot API à anticiper** :
- Dev key = 100 req / 2 min, **insuffisant** dès qu'on dépasse 30 users actifs
- → demander une **personal API key** Riot dès Phase 1 (delay ~1-2 sem)
- Implémenter un rate limiter dans le worker (token bucket, retry avec exponential backoff sur 429)

### 5.4 Bot DM consumer

Boucle async séparée dans le bot Python :

1. Toutes les 30s : `SELECT * FROM dm_queue WHERE status = 'pending' ORDER BY created_at LIMIT 20`
2. Pour chaque job : envoyer un DM Discord au `discord_id` avec un `discord.Embed` + `discord.ui.View` à boutons :
   ```
   🎮 Game terminée — qui mérite quoi ?
   
   You: Caitlyn 12/2/8 (Win)
   
   [Allies]
   - @Mathieu : Yuumi 0/9/15
   - @Lucas : Yasuo 4/11/3
   [Enemies]
   - @Pierre : Lux 8/4/12
   
   [🍄 @Mathieu] [⭐ @Mathieu]
   [🍄 @Lucas]   [⭐ @Lucas]
   [🍄 @Pierre]  [⭐ @Pierre]
   ```
3. Click sur bouton → callback HTTP **POST** `/rep/give` avec `{ giver_discord_id, receiver_puuid, match_id, type }`
4. Marquer `status = 'sent'` ou `'failed'` selon le résultat ; retry `attempts < 3`

### 5.5 Surface API

Endpoints **nouveaux** :

| Méthode | Route | Purpose |
|---|---|---|
| POST | `/auth/link` | Lie Discord ↔ Riot (post-OAuth Discord, demande Riot ID) |
| GET | `/rep/eligible` | Query `?giver_puuid=&receiver_puuid=`. Retourne la liste des `match_id` où les deux PUUIDs sont présents ET où aucun event de chaque type (shroom/respect) n'existe encore pour cette paire. Utilisé par `/judge` (Phase 1) et le DM consumer pour pré-vérifier. |
| POST | `/rep/give` | Crée un `reputation_event`. Body : `{ giver_discord_id, receiver_puuid, match_id, type, reason? }`. Vérifie quota match unique + giver linked + match contient les deux puuids. Crédit honey en cascade. |
| GET | `/profile/:puuid` | Profil public : rep counts + recent events + cosmétiques. Pas d'auth. |
| GET | `/profile/me` | Profil privé (auth Bearer) avec balance honey + ledger récent |
| GET | `/leaderboard` | Query : `?period=week|month|all&type=respects|shrooms|honey&scope=global|guild&guild_id=` |
| GET | `/economy/balance` | `{ user_puuid, balance, last_daily_at }` (auth) |
| POST | `/economy/spend` | Body : `{ amount, reason, metadata }` (auth, fail si solde insuffisant) |
| POST | `/economy/credit` | Body : `{ amount, reason, metadata }` — appelé par minigame win endpoints (signature/auth interne) |

Endpoints **existants à garder** :
- Toutes les routes `/lol/*` (data layer du webapp) — déjà nettoyées dans la passe d'audit
- `/auth/discord/*` — réutilisées dans le flow `/auth/link`

Endpoints **à supprimer** :
- `POST /game/shroom`, `POST /game/respect` (remplacés par `/rep/give`)
- `GET /game/stats/:username`, `/game/top/shrooms`, `/game/top/respects` (remplacés par `/profile/:puuid` + `/leaderboard`)

### 5.6 Webapp — pages

| Route | Rôle | Cache |
|---|---|---|
| `/` | Landing (existante, à réviser pour parler du nouveau modèle) | static |
| `/u/[gameName]-[tagLine]` | Profil public partageable (rep, stats, recent events, badges, cosmétiques) | ISR 60s |
| `/u/me` | Mon profil + édition cosmétiques + balance honey + ledger | dynamic, auth |
| `/leaderboard` | Trending : period × type × scope. Filtres dans l'UI. | ISR 30s |
| `/games` | Hub mini-jeux refondu. Chaque jeu a un coût d'entrée et un payout en honey | dynamic |
| `/shop` | Cosmétiques achetables avec honey | ISR 5 min |
| `/search` | Recherche invocateur (existant) | dynamic |
| `/auth/link` | Onboarding link Discord ↔ Riot | dynamic |
| `/auth/callback` | Callback OAuth Discord (existant, légère modif pour rediriger vers `/auth/link` si pas de Riot ID lié) | - |

### 5.7 Migration depuis l'existant

- `DROP TABLE shrooms` + `DROP TABLE respects` — la donnée actuelle (1 row sur respects) est jetable, projet école sans prod
- Nouvelles migrations Lucid : `add_honey_to_users`, `create_reputation_events`, `create_honey_ledger`, `create_match_poll_state`, `create_dm_queue`
- Routes legacy `/game/*` supprimées net (rien en prod, rien à préserver)
- Le bot Python : `Discord/Commands/api_beemo.py` → réécrit pour pointer sur `/rep/give` et `/economy/*`

## 6. Phasing

### Phase 1 — MVP réactif (semaines 1-3)

- Migrations DB (drop ancien + nouvelles tables)
- API : `/auth/link`, `/rep/give`, `/profile/:puuid`, `/economy/balance`
- Webapp : `/auth/link`, `/u/[riotId]` (version minimale)
- Bot : `/link` (renvoie webapp), `/me`, `/judge @user` (réactif : check les matchs récents et propose l'eligible)
- **No worker yet**

**DoD** : 2 users peuvent se shroomer après une vraie game via `/judge`.

### Phase 2 — Match Worker proactif (semaines 4-6)

- Match Worker (Python, cron + asyncio)
- Tables `match_poll_state` + `dm_queue`
- Riot API rate limiter + retry
- Bot DM consumer (boucle 30s) + embed à boutons
- Personal API key Riot demandée
- Tests load avec 50-100 users simulés

**DoD** : tu finis une game, tu reçois un DM dans les 5 min sans rien faire.

### Phase 3 — Économie & Hall of Fame (semaines 7-9)

- Honey ledger câblé (events crédités automatiquement à chaque rep give)
- 5 mini-jeux existants : connect bet/win en honey via `/economy/spend` + `/economy/credit`
- Webapp `/leaderboard` (week / month / all-time × shroom / respect / honey × global / guild)
- Webapp `/shop` avec ~10 cosmétiques (badges, profile borders, glow effects)
- Notification `🍯 +50 honey` dans les DMs après rep give

**DoD** : un user peut gagner du honey, le dépenser sur trivia, voir son rang trending.

### Phase 4 — Polish & soutenance (semaines 10-12)

- `/beemobot setup` server admin (enable/disable, leaderboard guild)
- Phantom rep claim flow (notif au premier link si pending events)
- Performance : caching Riot API (champion data, version), indexes DB tunés, monitoring (logs structurés + dashboard simple)
- Documentation utilisateur sur webapp (`/documentation` existant à réviser)
- README polish, démo vidéo, slide deck soutenance
- CI : typecheck + lint + tests fumée sur les 3 projets

**DoD** : un nouvel utilisateur arrive sur la landing, link son compte, joue une game, reçoit son DM, donne sa rep, voit son score sur le leaderboard, achète un badge — sans bug ni friction visible.

## 7. Risques & open questions

### Risques

1. **Riot API rate limit** — la dev key (100/2min) sera saturée dès Phase 2. *Mitigation* : demander la personal API key dès Phase 1 (~1-2 sem de delay côté Riot), implémenter un token bucket dans le worker.
2. **Discord rate limit DMs** — pas un problème en dessous de 50 DMs/min, mais surveiller les bursts. *Mitigation* : DM consumer avec rate limit interne 1 DM / 1.5s.
3. **Phantom rep claim** — si un user link son Riot mais rebrand son `gameName#tagLine`, le PUUID reste stable mais l'affichage change. *Mitigation* : stocker `riot_puuid` comme clé unique partout, jamais `name#tag` (déjà le cas dans le design).
4. **DM ignoré / bot bloqué** — un user peut désactiver les DMs serveur, le bot ne peut rien envoyer. *Mitigation* : fallback sur `/judge` réactif (Phase 1 reste actif comme failsafe), et opt-in sur un channel public (Phase 4).
5. **Abus collusion** — deux potes se respectent mutuellement à chaque game pour grind. *Mitigation* (post-MVP) : weight diminue si 2 users se give >70% mutuellement.

### Open questions (à résoudre en Phase 1)

- **Daily honey** : trigger sur quel event exactement ? Premier `/me` du jour ? Premier event créé ? → Choisir : trigger sur **premier event créé** (rep give, mini-jeu, /me) pour simplifier la logique côté API.
- **Reasons** sur les rep events : optionnels en v1 (champ `reason TEXT NULL`), à exposer dans l'UI seulement si le bouton DM a une variante "shroom avec raison" (Phase 3 ou 4).
- **Cosmétiques exacts** : la liste précise (10 items pour Phase 3) sera draftée avec une mini-session brainstorm Phase 3.
- **Server-level admin commands** : `/beemobot setup` aura quelles options ? À spécifier en Phase 4.

## 8. Métriques de succès (à la soutenance)

- ≥ 20 utilisateurs réels linkés (potes Ynov + commus de test)
- ≥ 100 reputation events créés "naturellement" (pas via testing)
- ≥ 50 sessions de mini-jeux avec honey
- ≥ 5 cosmétiques achetés
- Worker uptime > 95% sur les 4 dernières semaines
- API p95 latence < 300ms sur les endpoints critiques (`/rep/give`, `/profile/:puuid`)
- Zero crash bot sur les 4 dernières semaines

---

## Annexe — Stack & deps confirmées

- **API** : AdonisJS 6, Postgres, Lucid ORM, vinejs validators (déjà en place après l'audit)
- **Bot** : Python 3.x, discord.py, aiohttp (post-audit), riotwatcher
- **Worker** : Python (même process root que le bot OU process séparé, à trancher en Phase 2 — recommandation : process séparé pour isoler les crashes)
- **Webapp** : Next.js 15, React 19, Tailwind, Three.js (existant)
- **Hosting** : à décider (Phase 4) — option simple Railway/Fly.io pour API+worker, Vercel pour webapp
