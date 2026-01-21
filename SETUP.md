<!--
Copyright (c) 2024-2026 BeemoBot Enterprise
All rights reserved.
-->

# BeemoBot API - Guide de Configuration

Ce guide vous aidera à configurer l'API BeemoBot pour le développement local avec PostgreSQL, Discord OAuth et l'API Riot Games.

## Prérequis

- Node.js 18+
- PostgreSQL 14+ installé localement
- Un compte Discord Developer
- Une clé API Riot Games (gratuite)

## 1. Installation de PostgreSQL

### macOS

```bash
brew install postgresql@14
brew services start postgresql@14
```

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
```

### Windows

Téléchargez l'installateur depuis [postgresql.org](https://www.postgresql.org/download/windows/)

## 2. Configuration de la Base de Données

### Créer la base de données

```bash
psql -U postgres
```

Dans le shell PostgreSQL :

```sql
CREATE DATABASE beemobot;
\q
```

### Configurer le mot de passe postgres (si nécessaire)

```bash
psql -U postgres
ALTER USER postgres PASSWORD 'postgres';
```

## 3. Configuration Discord OAuth

### Créer une application Discord

1. Allez sur [Discord Developer Portal](https://discord.com/developers/applications)
2. Cliquez sur "New Application"
3. Donnez un nom à votre application (ex: "BeemoBot Local")
4. Allez dans l'onglet "OAuth2"
5. Ajoutez une URL de redirection :
   ```
   http://localhost:3333/auth/discord/callback
   ```
6. Notez le **Client ID** et **Client Secret**

### Scopes Discord requis

- `identify` : Pour récupérer l'ID et le nom d'utilisateur
- `email` : Pour récupérer l'email de l'utilisateur

## 4. Configuration Riot Games API

### Obtenir une Riot API Key

1. Allez sur [Riot Developer Portal](https://developer.riotgames.com/)
2. Connectez-vous avec votre compte Riot Games
3. Dans le Dashboard, allez dans la section "API Keys" ou "Development API Key"
4. Cliquez sur "Generate API Key" ou "Regenerate API Key"
5. Copiez la **API Key** (format: `RGAPI-xxxxxxxxx`)

### Important pour l'API Riot

- **Les clés de développement expirent toutes les 24h** - vous devrez la régénérer quotidiennement
- Pour une clé permanente (production), soumettez votre projet pour approbation sur le portail
- **Respectez les rate limits** :
  - Clé dev : 20 requêtes/seconde, 100 requêtes/2 minutes
  - Clé prod : 3,000 requêtes/10 secondes, 180,000 requêtes/10 minutes
- Implémentez un système de cache (Redis recommandé) pour éviter de dépasser les limites

### Note sur l'authentification Riot RSO

L'authentification via Riot RSO OAuth n'est **pas activée** dans cette version de l'API. Les utilisateurs se connectent uniquement via Discord OAuth. Les données League of Legends sont récupérées via l'API Riot en utilisant le nom d'invocateur du joueur.

## 5. Installation du Projet

### Cloner et installer les dépendances

```bash
cd beemobot-api
npm install
```

### Configurer les variables d'environnement

```bash
cp .env.example .env
```

Éditez le fichier `.env` avec vos valeurs :

```env
# Application
TZ=UTC
PORT=3333
HOST=localhost
LOG_LEVEL=info
APP_KEY=<généré automatiquement>
NODE_ENV=development

# PostgreSQL Local
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=
DB_DATABASE=postgres

# Discord OAuth
DISCORD_CLIENT_ID=votre_discord_client_id
DISCORD_CLIENT_SECRET=votre_discord_client_secret
DISCORD_CALLBACK_URL=http://localhost:3333/auth/discord/callback

# Riot API
RIOT_API_KEY=RGAPI-votre-cle-api-riot
```

**Notes importantes** :

- La base de données PostgreSQL utilise l'utilisateur par défaut `postgres` sans mot de passe
- La clé API Riot de développement **expire toutes les 24h** - vous devrez la regénérer quotidiennement

### Générer la clé d'application (si pas déjà fait)

```bash
node ace generate:key
```

## 6. Lancer les Migrations

```bash
node ace migration:run
```

Cette commande va créer toutes les tables nécessaires :

- `users` : Utilisateurs avec Discord ID
- `auth_access_tokens` : Tokens d'authentification
- `shrooms` : Système de réputation Shrooms
- `respects` : Système de réputation Respects
- `champions` : Champions League of Legends
- `reports` : Rapports utilisateurs

## 7. Lancer le Serveur

### Mode développement

```bash
npm run dev
```

### Mode production

```bash
npm run build
node build/bin/server.js
```

## 8. Tester l'API

### Discord OAuth

1. Ouvrez votre navigateur sur : `http://localhost:3333/auth/discord/redirect`
2. Autorisez l'application Discord
3. Vous serez redirigé vers `https://beemobot.fr/profile?token=beemo_xxxxx` avec votre token d'authentification

### Tester avec cURL

#### Endpoints Game (Bot Discord)

```bash
# Récupérer les stats d'un utilisateur
curl http://localhost:3333/game/stats/username

# Donner un shroom
curl -X POST http://localhost:3333/game/shroom \
  -H "Content-Type: application/json" \
  -d '{"username": "PlayerName", "reason": "Good play!"}'
```

#### Endpoints League of Legends

```bash
# Récupérer la version du jeu
curl http://localhost:3333/lol/version

# Récupérer tous les champions
curl http://localhost:3333/lol/champions

# Récupérer les détails d'Ahri
curl http://localhost:3333/lol/champion/Ahri

# Récupérer les informations d'un joueur EUW
curl "http://localhost:3333/lol/summoner/YourSummonerName?region=euw1"

# Récupérer le rang d'un joueur
curl "http://localhost:3333/lol/summoner/YourSummonerName/rank?region=euw1"

# Récupérer les top 3 champions d'un joueur
curl "http://localhost:3333/lol/summoner/YourSummonerName/masteries?top=3&region=euw1"

# Récupérer les 5 derniers matchs
curl "http://localhost:3333/lol/summoner/YourSummonerName/matches?count=5&region=euw1&platform=europe"
```

## 9. Structure du Projet

```
beemobot-api/
├── app/
│   ├── controllers/      # Contrôleurs HTTP
│   ├── models/           # Modèles de données (Lucid ORM)
│   ├── services/         # Logique métier
│   └── middleware/       # Middleware HTTP
├── config/               # Fichiers de configuration
├── database/
│   └── migrations/       # Migrations de base de données
├── start/                # Fichiers de démarrage
└── .env                  # Variables d'environnement
```

## 10. Endpoints Disponibles

### Authentification

- `GET /auth/discord/redirect` - Redirige vers Discord OAuth
- `GET /auth/discord/callback` - Callback Discord

### Game (Bot Discord)

- `POST /game/shroom` - Donner un shroom
- `POST /game/respect` - Donner un respect
- `GET /game/stats/:username` - Stats d'un utilisateur
- `GET /game/top/shrooms` - Top 10 shrooms
- `GET /game/top/respects` - Top 10 respects

### League of Legends (Riot API)

#### Informations générales

- `GET /lol/version` - Version actuelle du jeu
- `GET /lol/champions` - Liste de tous les champions
- `GET /lol/champion/:championName` - Détails d'un champion (ex: `/lol/champion/Ahri`)
- `GET /lol/items` - Liste de tous les objets

#### Informations des joueurs

- `GET /lol/summoner/:summonerName` - Informations d'un invocateur

  - Query params: `region` (défaut: `euw1`)
  - Exemple: `/lol/summoner/Faker?region=kr`

- `GET /lol/summoner/:summonerName/rank` - Rang d'un invocateur

  - Query params: `region` (défaut: `euw1`)
  - Retourne le rang Solo/Duo et Flex

- `GET /lol/summoner/:summonerName/masteries` - Masteries de champions

  - Query params: `region` (défaut: `euw1`), `top` (défaut: 10)
  - Exemple: `/lol/summoner/Faker/masteries?top=5&region=kr`

- `GET /lol/summoner/:summonerName/matches` - Historique de matchs

  - Query params: `region` (défaut: `euw1`), `platform` (défaut: `europe`), `count` (défaut: 10)
  - Exemple: `/lol/summoner/Faker/matches?count=20&region=kr&platform=asia`

- `GET /lol/match/:matchId` - Détails d'un match
  - Query params: `platform` (défaut: `europe`)
  - Exemple: `/lol/match/EUW1_123456789?platform=europe`

#### Régions disponibles

- **Europe West**: `euw1`
- **Europe Nordic & East**: `eun1`
- **North America**: `na1`
- **Korea**: `kr`
- **Brazil**: `br1`
- **Japan**: `jp1`
- **Latin America North**: `la1`
- **Latin America South**: `la2`
- **Oceania**: `oc1`
- **Turkey**: `tr1`
- **Russia**: `ru`

#### Platforms (pour les matchs)

- **Europe**: `europe`
- **Americas**: `americas`
- **Asia**: `asia`
- **SEA**: `sea`

## Troubleshooting

### Erreur de connexion PostgreSQL

- Vérifiez que PostgreSQL est démarré : `brew services list` (macOS)
- Vérifiez les credentials dans `.env`
- Testez la connexion : `psql -U postgres -d beemobot`

### Erreur Discord OAuth

- Vérifiez que l'URL de callback correspond exactement
- Vérifiez que les scopes sont corrects
- Assurez-vous que le Client Secret est correct

### Erreur Riot API

- **403 Forbidden** : Votre clé API a expiré (les clés dev expirent toutes les 24h)
  - Solution : Régénérez une nouvelle clé sur le Developer Portal
- **429 Too Many Requests** : Vous avez dépassé les rate limits
  - Solution : Attendez quelques secondes/minutes, implémentez un système de cache
- **404 Not Found** : Le joueur n'existe pas ou la région est incorrecte
  - Solution : Vérifiez le nom du joueur et la région
- **Data Dragon erreurs** : Problème de réseau ou version invalide
  - Solution : Vérifiez votre connexion internet

### Erreur de migration

```bash
# Rollback toutes les migrations
node ace migration:rollback

# Relancer les migrations
node ace migration:run
```

## Prochaines Étapes

1. ✅ ~~Intégrer l'API Riot pour récupérer les données LoL~~ **Fait !**
2. ✅ ~~Implémenter les endpoints pour les champions~~ **Fait !**
3. Ajouter un système de cache pour les données Riot (Redis recommandé)
4. Implémenter un système de notification pour le renouvellement de la clé API Riot
5. Créer des endpoints pour les builds recommandés (intégration U.GG ou OP.GG)
6. Ajouter un système de favoris pour que les utilisateurs sauvent leurs champions préférés
7. Implémenter un système de notifications pour les patchs/mises à jour
8. Ajouter des tests unitaires et d'intégration
9. Documenter l'API avec Swagger/OpenAPI
10. Implémenter un système de rate limiting pour protéger votre clé API Riot

## Recommandations

### Cache Redis

Pour éviter de dépasser les rate limits Riot et améliorer les performances, implémentez un cache :

```bash
npm install ioredis
```

### Rate Limiting

Installez un middleware de rate limiting :

```bash
npm install @adonisjs/limiter
```

### Validation des Inputs

Utilisez VineJS (déjà installé) pour valider les entrées utilisateur :

```typescript
import vine from '@vinejs/vine'

const summonerSchema = vine.object({
  summonerName: vine.string().minLength(3).maxLength(16),
  region: vine.enum(['euw1', 'na1', 'kr', 'br1', 'eun1', 'jp1', 'la1', 'la2', 'oc1', 'ru', 'tr1']),
})
```

## Support

Pour toute question, consultez :

- [Documentation AdonisJS](https://docs.adonisjs.com/)
- [Riot Developer Portal](https://developer.riotgames.com/)
- [Discord Developer Portal](https://discord.com/developers/docs)
