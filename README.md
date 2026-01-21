<!--
Copyright (c) 2024-2026 BeemoBot Enterprise
All rights reserved.
-->

# BeemoBot API

API complète pour application de suivi League of Legends avec authentification Discord et système de réputation.

**Version** : 1.0.0  
**Stack** : AdonisJS 6 + TypeScript + PostgreSQL  
**API Riot Games** : v4/v5 (PUUID-based)

---

## 🚀 Quick Start

```bash
# Installation
npm install

# Configuration
cp .env.example .env
# Éditez .env avec vos credentials

# Base de données
psql -U postgres -c "CREATE DATABASE beemobot;"
node ace migration:run

# Démarrage
npm run dev
```

Le serveur démarre sur `http://localhost:3333`

---

## 📚 Documentation

### Documentation API Complète

- **[API.md](./API.md)** - 📖 **Documentation complète unique** pour l'intégration frontend
  - Tous les endpoints (LoL, Game, Auth)
  - Exemples TypeScript, React, Vue, Discord.js
  - Réponses JSON réelles avec calculs
  - Gestion des erreurs et rate limiting
  - Bonnes pratiques d'intégration

### Documentation Technique

- **[SETUP.md](./SETUP.md)** - Configuration et installation du projet

---

## ⭐ Endpoint Principal

### Profil Complet d'un Joueur

```bash
GET /lol/summoner/:summonerName/profile?region=euw1
```

**Renvoie en 1 seule requête** :

- ✅ Informations du joueur (niveau, PUUID, gameName#tagLine)
- ✅ Rangs classés (Solo/Duo + Flex) avec winrate calculé
- ✅ Top champions avec masteries et images
- ✅ 5 derniers matchs détaillés (KDA, CS, gold, items, victoire/défaite)

**Exemple** :

```javascript
const response = await fetch('https://api.beemobot.fr/lol/summoner/nunch-N7789/profile?region=euw1')
const profile = await response.json()

console.log(`${profile.summoner.gameName}#${profile.summoner.tagLine}`)
console.log(`Niveau ${profile.summoner.summonerLevel}`)
console.log(`${profile.ranks[0].tier} ${profile.ranks[0].rank} - ${profile.ranks[0].winRate}% WR`)
```

---

## 🎮 Fonctionnalités

### League of Legends

- 🔍 **Recherche de joueurs** : Système Riot ID (gameName + tagLine)
- 📊 **Profil complet** : Infos, rangs, champions, matchs en 1 requête
- 🏆 **Rangs classés** : Solo/Duo et Flex avec winrate
- 🎯 **Masteries** : Top champions avec niveaux et points
- ⚔️ **Historique** : Matchs détaillés avec KDA, CS, gold, items
- 📖 **Champions & Items** : Données complètes Data Dragon

### Bot Discord

- 🍄 **Système Shrooms** : Points de réputation
- 🙏 **Système Respects** : Reconnaissance joueurs
- 📈 **Statistiques** : Top 10 et stats par utilisateur
- 🎮 **Intégration** : Commandes slash Discord.js v14

### Authentification

- 🔐 **Discord OAuth** : Connexion utilisateur
- 🎫 **Bearer Tokens** : Accès sécurisé API
- 👤 **Gestion Users** : Base PostgreSQL

---

3. **Riot API Key** : Clé de développement gratuite (expire toutes les 24h) - [Riot Developer Portal](https://developer.riotgames.com/)

## Variables d'Environnement

```env
# Base de données
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_DATABASE=postgres

# Discord OAuth
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:3333/auth/discord/callback

# Riot API
RIOT_API_KEY=RGAPI-your-api-key
```

## Endpoints Principaux

### Authentification

- `GET /auth/discord/redirect` - Connexion Discord OAuth

### League of Legends

- `GET /lol/champions` - Liste des champions
- `GET /lol/champion/:name` - Détails d'un champion
- `GET /lol/summoner/:name` - Infos d'un joueur
- `GET /lol/summoner/:name/profile` - **Profil complet d'un joueur** (infos, ranks, top champions, matchs)
- `GET /lol/summoner/:name/rank` - Rang d'un joueur
- `GET /lol/summoner/:name/masteries` - Masteries
- `GET /lol/summoner/:name/matches` - Historique

### Game (Bot Discord)

- `POST /game/shroom` - Donner un shroom
- `POST /game/respect` - Donner un respect
- `GET /game/top/shrooms` - Top shrooms
- `GET /game/top/respects` - Top respects

## Exemples d'Utilisation

### Récupérer le profil complet d'un joueur (NOUVEAU ⭐)

```bash
# Profil complet avec infos, ranks, top 5 champions et 10 matchs détaillés
curl "http://localhost:3333/lol/summoner/nunch-N7789/profile?region=euw1&platform=europe"

# Réponse inclut :
# - Informations du joueur (niveau, PUUID, gameName#tagLine)
# - Rangs classés (Solo/Duo, Flex) avec winrate
# - Top champions avec images et points de maîtrise
# - Détails des 5 derniers matchs (KDA, CS, gold, items, victoire/défaite)
```

### Récupérer les infos d'un joueur

```bash
curl "http://localhost:3333/lol/summoner/Faker?region=kr"
```

### Récupérer les top 5 champions d'un joueur

```bash
curl "http://localhost:3333/lol/summoner/Faker/masteries?top=5&region=kr"
```

### Récupérer tous les champions

```bash
curl "http://localhost:3333/lol/champions"
```

## Documentation Complète

Pour la documentation complète, consultez [SETUP.md](./SETUP.md)

## Architecture du Projet

```
beemobot-api/
├── app/
│   ├── controllers/          # Contrôleurs HTTP
│   │   ├── auth_controller.ts
│   │   ├── game_controller.ts
│   │   └── lol_controller.ts
│   ├── models/               # Modèles Lucid
│   │   └── user.ts
│   └── services/             # Services métier
│       ├── auth_service.ts
│       └── riot_api_service.ts
├── config/                   # Configuration
│   ├── ally.ts              # OAuth providers
│   ├── auth.ts              # Auth config
│   └── database.ts          # Database config
├── database/
│   └── migrations/          # Migrations SQL
├── start/                   # Démarrage app
│   ├── routes.ts           # Définition des routes
│   ├── kernel.ts           # Middleware
│   └── ally.ts             # Custom OAuth provider
└── .env                    # Variables d'environnement
```

## Régions Riot API

| Code   | Région               |
| ------ | -------------------- |
| `euw1` | Europe West          |
| `eun1` | Europe Nordic & East |
| `na1`  | North America        |
| `kr`   | Korea                |
| `br1`  | Brazil               |
| `jp1`  | Japan                |
| `la1`  | Latin America North  |
| `la2`  | Latin America South  |
| `oc1`  | Oceania              |
| `tr1`  | Turkey               |
| `ru`   | Russia               |

## Développement

```bash
# Mode développement avec hot reload
npm run dev

# Build production
npm run build

# Démarrer en production
node build/bin/server.js

# Lancer les tests
npm test
```

## Troubleshooting

### Clé API Riot expirée

Les clés de développement expirent toutes les 24h. Régénérez-en une nouvelle sur le [Developer Portal](https://developer.riotgames.com/).

### Erreur de connexion PostgreSQL

Vérifiez que PostgreSQL est démarré :

```bash
# macOS
brew services list

# Linux
sudo systemctl status postgresql
```

### Rate Limit Riot API

Implémentez un système de cache (Redis recommandé) pour réduire les appels API.

## Contributions

Ce projet est en développement actif. Les contributions sont les bienvenues !

## Licence

MIT

## Support

- [Documentation AdonisJS](https://docs.adonisjs.com/)
- [Riot Developer Portal](https://developer.riotgames.com/)
- [Riot API Documentation](https://developer.riotgames.com/apis)
- [Discord Developer Portal](https://discord.com/developers/docs)
