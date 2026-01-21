<!--
Copyright (c) 2024-2026 BeemoBot Enterprise
All rights reserved.
-->

# BeemoBot API - Documentation Complète

Documentation complète de l'API BeemoBot pour l'intégration avec les services frontend, bot Discord, et applications tierces.

**Version** : 1.0.0  
**Base URL Development** : `http://localhost:3333`  
**Base URL Production** : `https://api.beemobot.fr`  
**Format** : JSON  
**Authentification** : Bearer Token (pour les routes protégées)  
**Dernière mise à jour** : 21 janvier 2026

---

## 🚀 Quick Start

```bash
# Profil complet d'un joueur (RECOMMANDÉ)
curl "https://api.beemobot.fr/lol/summoner/nunch-N7789/profile?region=euw1"

# Informations basiques
curl "https://api.beemobot.fr/lol/summoner/Faker-KR1?region=kr"

# Liste des champions
curl "https://api.beemobot.fr/lol/champions"
```

---

## 📋 Table des Matières

1. [Authentification](#authentification)
2. [Endpoints Game (Bot Discord)](#endpoints-game-bot-discord)
3. [Endpoints League of Legends](#endpoints-league-of-legends)
   - [⭐ Profil Complet (Recommandé)](#profil-complet-dun-invocateur)
   - [Informations de Base](#informations-dun-invocateur)
   - [Rangs & Masteries](#rang-dun-invocateur)
   - [Champions & Items](#liste-des-champions)
4. [Codes d'Erreur](#codes-derreur)
5. [Rate Limiting](#rate-limiting)
6. [Régions et Platforms](#régions-et-platforms)
7. [Exemples d'Intégration](#exemples-dintégration)

---

## Authentification

### OAuth Discord

#### Redirection vers Discord

```http
GET /auth/discord/redirect
```

**Description** : Redirige l'utilisateur vers la page d'autorisation Discord.

**Paramètres** : Aucun

**Réponse** : Redirection HTTP vers Discord OAuth

**Exemple** :

```bash
curl -L http://localhost:3333/auth/discord/redirect
```

---

#### Callback Discord

```http
GET /auth/discord/callback
```

**Description** : Gère le retour de Discord après autorisation. Crée ou met à jour l'utilisateur et génère un token.

**Paramètres Query** :
| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| code | string | Oui | Code d'autorisation Discord |
| state | string | Oui | État de sécurité OAuth |

**Réponse Succès** : Redirection vers `https://beemobot.fr/profile?token=beemo_xxxxx`

**Réponse Erreur** :

```json
{
  "error": "access_denied",
  "message": "Discord access was denied"
}
```

**Codes d'erreur possibles** :

- `403` - access_denied : L'utilisateur a refusé l'autorisation
- `400` - state_mismatch : Erreur de validation de sécurité
- `400` - authentication_error : Erreur générale d'authentification
- `500` - server_error : Erreur serveur

---

### Note sur l'Authentification Riot

**L'authentification via Riot RSO OAuth n'est pas disponible pour le moment.**

L'API utilise uniquement :

- **Discord OAuth** pour l'authentification des utilisateurs
- **Riot API Key** pour récupérer les données League of Legends (statistiques, champions, matchs, etc.)

Les utilisateurs se connectent avec Discord, puis peuvent consulter leurs statistiques League of Legends via les endpoints `/lol/*` en fournissant leur nom d'invocateur.

---

## Endpoints Game (Bot Discord)

Ces endpoints sont utilisés par le bot Discord pour gérer le système de réputation.

### Donner un Shroom

```http
POST /game/shroom
```

**Description** : Donne un shroom (point de réputation) à un utilisateur.

**Headers** :

```
Content-Type: application/json
```

**Body** :

```json
{
  "username": "PlayerName",
  "reason": "Good play!" // Optionnel
}
```

**Paramètres** :
| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| username | string | Oui | Nom d'utilisateur Discord |
| reason | string | Non | Raison du shroom |

**Réponse Succès** (200) :

```json
{
  "id": 123,
  "username": "PlayerName",
  "reason": "Good play!",
  "created_at": "2025-01-21T10:30:00.000Z",
  "updated_at": "2025-01-21T10:30:00.000Z"
}
```

**Exemple cURL** :

```bash
curl -X POST http://localhost:3333/game/shroom \
  -H "Content-Type: application/json" \
  -d '{
    "username": "PlayerName",
    "reason": "Good play!"
  }'
```

---

### Donner un Respect

```http
POST /game/respect
```

**Description** : Donne un respect (point de réputation) à un utilisateur.

**Headers** :

```
Content-Type: application/json
```

**Body** :

```json
{
  "username": "PlayerName",
  "reason": "Great teamwork!" // Optionnel
}
```

**Paramètres** :
| Champ | Type | Requis | Description |
|-------|------|--------|-------------|
| username | string | Oui | Nom d'utilisateur Discord |
| reason | string | Non | Raison du respect |

**Réponse Succès** (200) :

```json
{
  "id": 456,
  "username": "PlayerName",
  "reason": "Great teamwork!",
  "created_at": "2025-01-21T10:35:00.000Z",
  "updated_at": "2025-01-21T10:35:00.000Z"
}
```

**Exemple cURL** :

```bash
curl -X POST http://localhost:3333/game/respect \
  -H "Content-Type: application/json" \
  -d '{
    "username": "PlayerName",
    "reason": "Great teamwork!"
  }'
```

---

### Statistiques Utilisateur

```http
GET /game/stats/:username
```

**Description** : Récupère le nombre total de shrooms et respects d'un utilisateur.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| username | string | Nom d'utilisateur Discord |

**Réponse Succès** (200) :

```json
{
  "username": "PlayerName",
  "totalShrooms": 42,
  "totalRespects": 18
}
```

**Exemple** :

```bash
curl http://localhost:3333/game/stats/PlayerName
```

---

### Top Shrooms

```http
GET /game/top/shrooms
```

**Description** : Récupère le top 10 des utilisateurs avec le plus de shrooms.

**Paramètres** : Aucun

**Réponse Succès** (200) :

```json
[
  {
    "username": "Player1",
    "count": 150
  },
  {
    "username": "Player2",
    "count": 120
  },
  {
    "username": "Player3",
    "count": 95
  }
]
```

**Exemple** :

```bash
curl http://localhost:3333/game/top/shrooms
```

---

### Top Respects

```http
GET /game/top/respects
```

**Description** : Récupère le top 10 des utilisateurs avec le plus de respects.

**Paramètres** : Aucun

**Réponse Succès** (200) :

```json
[
  {
    "username": "Player1",
    "count": 88
  },
  {
    "username": "Player2",
    "count": 75
  },
  {
    "username": "Player3",
    "count": 62
  }
]
```

**Exemple** :

```bash
curl http://localhost:3333/game/top/respects
```

---

## Endpoints League of Legends

Ces endpoints utilisent l'API Riot Games pour récupérer les données League of Legends.

### ⚠️ Important : Migration vers Riot ID

**Depuis 2021, Riot Games utilise le système Riot ID (gameName + tagLine) au lieu des anciens summonerNames.**

**Changements clés :**

- Ancien : `Faker` (summonerName uniquement)
- Nouveau : `Faker` + `KR1` (gameName + tagLine)

**Formats supportés par l'API :**

1. **Format séparé** : `GameName-TagLine` → `Faker-KR1`
2. **Format simple** : `GameName` → `Faker` (tagLine déduit de la région)
3. **Paramètre query** : `?tagLine=KR1` (spécification manuelle)

**Exemples de migration :**

```bash
# ❌ Ancien (peut causer des 403)
curl "http://localhost:3333/lol/summoner/Faker?region=kr"

# ✅ Nouveau (recommandé)
curl "http://localhost:3333/lol/summoner/Faker-KR1?region=kr"
curl "http://localhost:3333/lol/summoner/Faker?region=kr&tagLine=KR1"
```

**Note :** L'API déduit automatiquement le tagLine selon la région si non spécifié (ex: `EUW` pour `euw1`, `KR1` pour `kr`).

---

### Version du Jeu

```http
GET /lol/version
```

**Description** : Récupère la version actuelle de League of Legends.

**Paramètres** : Aucun

**Réponse Succès** (200) :

```json
{
  "version": "14.1.1"
}
```

**Exemple** :

```bash
curl http://localhost:3333/lol/version
```

---

### Liste des Champions

```http
GET /lol/champions
```

**Description** : Récupère la liste complète de tous les champions League of Legends.

**Paramètres** : Aucun

**Réponse Succès** (200) :

```json
{
  "champions": {
    "Aatrox": {
      "version": "14.1.1",
      "id": "Aatrox",
      "key": "266",
      "name": "Aatrox",
      "title": "l'Épée des Darkin",
      "blurb": "Autrefois...",
      "info": {
        "attack": 8,
        "defense": 4,
        "magic": 3,
        "difficulty": 4
      },
      "image": {
        "full": "Aatrox.png",
        "sprite": "champion0.png",
        "group": "champion",
        "x": 0,
        "y": 0,
        "w": 48,
        "h": 48
      },
      "tags": ["Fighter", "Tank"],
      "partype": "Puits de sang",
      "stats": {
        "hp": 650,
        "hpperlevel": 114,
        "mp": 0,
        "mpperlevel": 0,
        "movespeed": 345,
        "armor": 38,
        "armorperlevel": 4.8,
        "spellblock": 32,
        "spellblockperlevel": 2.05,
        "attackrange": 175,
        "hpregen": 3,
        "hpregenperlevel": 1,
        "mpregen": 0,
        "mpregenperlevel": 0,
        "crit": 0,
        "critperlevel": 0,
        "attackdamage": 60,
        "attackdamageperlevel": 5,
        "attackspeedperlevel": 2.5,
        "attackspeed": 0.651
      }
    },
    "Ahri": { ... },
    ...
  },
  "count": 168
}
```

**Réponse Erreur** (500) :

```json
{
  "error": "champions_fetch_failed",
  "message": "Error details..."
}
```

**Exemple** :

```bash
curl http://localhost:3333/lol/champions
```

---

### Détails d'un Champion

```http
GET /lol/champion/:championName
```

**Description** : Récupère les détails complets d'un champion spécifique.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| championName | string | Nom exact du champion (ex: Ahri, MasterYi, AurelionSol) |

**Réponse Succès** (200) :

```json
{
  "id": "Ahri",
  "key": "103",
  "name": "Ahri",
  "title": "la Gumiho",
  "image": {
    "full": "Ahri.png",
    "sprite": "champion0.png",
    "group": "champion",
    "x": 48,
    "y": 0,
    "w": 48,
    "h": 48
  },
  "skins": [
    {
      "id": "103000",
      "num": 0,
      "name": "default",
      "chromas": false
    },
    {
      "id": "103001",
      "num": 1,
      "name": "Dynasty Ahri",
      "chromas": false
    }
  ],
  "lore": "Connectée...",
  "blurb": "Ahri...",
  "allytips": ["..."],
  "enemytips": ["..."],
  "tags": ["Mage", "Assassin"],
  "partype": "Mana",
  "info": {
    "attack": 3,
    "defense": 4,
    "magic": 8,
    "difficulty": 5
  },
  "stats": { ... },
  "spells": [
    {
      "id": "AhriOrbofDeception",
      "name": "Orbe d'illusion",
      "description": "Ahri...",
      "tooltip": "Ahri...",
      "leveltip": { ... },
      "maxrank": 5,
      "cooldown": [7, 7, 7, 7, 7],
      "cooldownBurn": "7",
      "cost": [65, 70, 75, 80, 85],
      "costBurn": "65/70/75/80/85",
      "datavalues": {},
      "effect": [ ... ],
      "effectBurn": [ ... ],
      "vars": [ ... ],
      "costType": "Mana",
      "maxammo": "-1",
      "range": [880, 880, 880, 880, 880],
      "rangeBurn": "880",
      "image": { ... },
      "resource": "65/70/75/80/85 Mana"
    }
  ],
  "passive": {
    "name": "Essence Drain",
    "description": "Ahri...",
    "image": { ... }
  },
  "recommended": []
}
```

**Réponse Erreur** (404) :

```json
{
  "error": "champion_not_found",
  "message": "Error details..."
}
```

**Exemple** :

```bash
curl http://localhost:3333/lol/champion/Ahri
curl http://localhost:3333/lol/champion/MasterYi
curl http://localhost:3333/lol/champion/LeeSin
```

---

### Liste des Items

```http
GET /lol/items
```

**Description** : Récupère la liste complète de tous les objets du jeu.

**Paramètres** : Aucun

**Réponse Succès** (200) :

```json
{
  "items": {
    "1001": {
      "name": "Bottes de vitesse",
      "description": "<mainText><stats><attention>25</attention> vitesse de déplacement</stats></mainText>",
      "colloq": ";bottes",
      "plaintext": "Augmente légèrement la vitesse de déplacement",
      "into": ["3006", "3009", "3020", "3047", "3111", "3117", "3158"],
      "image": {
        "full": "1001.png",
        "sprite": "item0.png",
        "group": "item",
        "x": 0,
        "y": 0,
        "w": 48,
        "h": 48
      },
      "gold": {
        "base": 300,
        "purchasable": true,
        "total": 300,
        "sell": 210
      },
      "tags": ["Boots"],
      "maps": {
        "11": true,
        "12": true,
        "21": true,
        "22": false,
        "30": false,
        "33": false
      },
      "stats": {
        "FlatMovementSpeedMod": 25
      }
    },
    "1004": { ... }
  },
  "count": 234
}
```

**Exemple** :

```bash
curl http://localhost:3333/lol/items
```

---

### Informations d'un Invocateur

```http
GET /lol/summoner/:summonerName
```

**Description** : Récupère les informations de base d'un invocateur League of Legends.

**Note importante** : Depuis 2021, l'API Riot utilise le système **Riot ID** (gameName + tagLine) au lieu du simple nom d'invocateur. Les formats supportés sont :

- `GameName-TagLine` : ex. `Faker-KR1`, `Caps-EUW`
- `GameName` seul : le tagLine sera déduit de la région (EUW pour euw1, KR1 pour kr, etc.)
- Paramètre `tagLine` dans la query : pour spécifier manuellement

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| summonerName | string | Nom d'invocateur (format: GameName ou GameName-TagLine) |

**Paramètres Query** :
| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| region | string | Non | euw1 | Région du serveur |
| tagLine | string | Non | Auto | TagLine Riot (ex: EUW, KR1, NA1) - déduit de la région si absent |

**Réponse Succès** (200) :

```json
{
  "id": "gJqxKELGlG8nR...",
  "accountId": "5LlxqKKLqabc...",
  "puuid": "abc123-def456-ghi789...",
  "name": "PlayerName",
  "profileIconId": 4568,
  "revisionDate": 1705840234000,
  "summonerLevel": 347,
  "gameName": "Faker",
  "tagLine": "KR1"
}
```

**Réponse Erreur** (404) :

```json
{
  "error": "summoner_not_found",
  "message": "Riot API Error (404): Account not found"
}
```

**Exemples** :

```bash
# Joueur coréen avec format GameName-TagLine
curl "http://localhost:3333/lol/summoner/Faker-KR1?region=kr"

# Joueur coréen avec tagLine automatique (KR1 par défaut)
curl "http://localhost:3333/lol/summoner/Faker?region=kr"

# Joueur NA avec tagLine explicite
curl "http://localhost:3333/lol/summoner/Doublelift?region=na1&tagLine=NA1"

# Joueur EUW (tagLine EUW par défaut)
curl "http://localhost:3333/lol/summoner/Caps?region=euw1"

# Format avec séparateur
curl "http://localhost:3333/lol/summoner/Caps-EUW?region=euw1"
```

**TagLines par défaut selon la région** :

- `euw1` → `EUW`
- `eun1` → `EUNE`
- `na1` → `NA1`
- `kr` → `KR1`
- `br1` → `BR1`
- `jp1` → `JP1`
- `la1` → `LAN`
- `la2` → `LAS`
- `oc1` → `OCE`
- `tr1` → `TR1`
- `ru` → `RU`

---

### Profil Complet d'un Invocateur

```http
GET /lol/summoner/:summonerName/profile
```

**Description** : Récupère le profil complet d'un invocateur en une seule requête : informations de base, rangs, meilleurs champions, et historique de matchs détaillé.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| summonerName | string | Nom d'invocateur (format: GameName, GameName-TagLine) |

**Paramètres Query** :
| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| region | string | Non | euw1 | Région du serveur |
| tagLine | string | Non | Auto | TagLine Riot - déduit de la région si absent |
| platform | string | Non | europe | Platform régionale (pour les matchs) |
| topChampions | number | Non | 5 | Nombre de champions à afficher |
| matchCount | number | Non | 10 | Nombre de matchs récents (5 détaillés) |

**Réponse Succès** (200) :

```json
{
  "summoner": {
    "puuid": "gWihzHy8KsMAdAuE28wyFxwpjvku...",
    "name": "PlayerName",
    "gameName": "Nunch",
    "tagLine": "N7789",
    "profileIconId": 3804,
    "summonerLevel": 624,
    "revisionDate": 1768947979591
  },
  "ranks": [
    {
      "queueType": "RANKED_FLEX_SR",
      "tier": "PLATINUM",
      "rank": "II",
      "leaguePoints": 14,
      "wins": 7,
      "losses": 14,
      "winRate": "33.3",
      "hotStreak": false,
      "veteran": false,
      "freshBlood": false
    }
  ],
  "topChampions": [
    {
      "championId": 523,
      "championName": "Aphelios",
      "championImage": "https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Aphelios.png",
      "championLevel": 52,
      "championPoints": 580911,
      "lastPlayTime": 1768159205000
    },
    {
      "championId": 64,
      "championName": "Lee Sin",
      "championImage": "https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/LeeSin.png",
      "championLevel": 21,
      "championPoints": 230318,
      "lastPlayTime": 1768179710000
    }
  ],
  "recentMatches": [
    {
      "matchId": "EUW1_7690940162",
      "gameMode": "CLASSIC",
      "gameCreation": 1768750589388,
      "gameDuration": 912,
      "participant": {
        "championName": "Yunara",
        "championId": 804,
        "kills": 6,
        "deaths": 4,
        "assists": 2,
        "totalDamageDealtToChampions": 8224,
        "goldEarned": 7528,
        "champLevel": 9,
        "totalMinionsKilled": 114,
        "visionScore": 14,
        "win": false,
        "items": [1055, 6672, 3085, 0, 0, 0, 3340],
        "teamPosition": "BOTTOM"
      }
    }
  ],
  "totalMatches": 10
}
```

**Exemples** :

```bash
# Profil complet avec 5 champions et 10 matchs
curl "https://128fe8e5ea55.ngrok-free.app/lol/summoner/nunch-N7789/profile?region=euw1&platform=europe"

# Profil avec 10 champions et 20 matchs
curl "https://128fe8e5ea55.ngrok-free.app/lol/summoner/Faker/profile?region=kr&platform=asia&topChampions=10&matchCount=20"

# Profil avec tagLine explicite
curl "https://128fe8e5ea55.ngrok-free.app/lol/summoner/Caps/profile?region=euw1&platform=europe&tagLine=EUW"
```

**Détails de la réponse** :

- **summoner** : Informations de base du joueur (PUUID, gameName, tagLine, niveau, icône)
- **ranks** : Rangs classés (Solo/Duo, Flex) avec winrate calculé automatiquement
- **topChampions** : Meilleurs champions par points de maîtrise avec images Data Dragon
- **recentMatches** : Détails des 5 derniers matchs joués (KDA, gold, CS, items, position, victoire/défaite)
- **totalMatches** : Nombre total de matchs disponibles dans l'historique

**Avantages par rapport aux endpoints séparés** :

✅ **1 seule requête** au lieu de 4+ requêtes séparées  
✅ **Requêtes parallèles** côté serveur (plus rapide)  
✅ **Winrate calculé** automatiquement pour chaque queue  
✅ **Images des champions** incluses (Data Dragon)  
✅ **Données enrichies** (KDA, CS, gold, dégâts par match)  
✅ **Optimisé** pour l'affichage de profil complet

**Cas d'usage idéal** :

- Page de profil joueur sur le frontend
- Commande `!profile` sur bot Discord
- Dashboard de statistiques
- Analyse de performance récente

---

### Rang d'un Invocateur

```http
GET /lol/summoner/:summonerName/rank
```

**Description** : Récupère les rangs (Solo/Duo et Flex) d'un invocateur.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| summonerName | string | Nom d'invocateur (format: GameName, GameName-TagLine) |

**Paramètres Query** :
| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| region | string | Non | euw1 | Région du serveur |
| tagLine | string | Non | Auto | TagLine Riot - déduit de la région si absent |

**Réponse Succès** (200) :

```json
{
  "summoner": {
    "name": "PlayerName",
    "gameName": "Faker",
    "tagLine": "KR1",
    "level": 347
  },
  "ranks": [
    {
      "leagueId": "abc123",
      "queueType": "RANKED_SOLO_5x5",
      "tier": "DIAMOND",
      "rank": "II",
      "summonerId": "gJqxKELGlG8nR...",
      "summonerName": "PlayerName",
      "leaguePoints": 67,
      "wins": 156,
      "losses": 142,
      "veteran": false,
      "inactive": false,
      "freshBlood": false,
      "hotStreak": true
    },
    {
      "leagueId": "def456",
      "queueType": "RANKED_FLEX_SR",
      "tier": "PLATINUM",
      "rank": "I",
      "summonerId": "gJqxKELGlG8nR...",
      "summonerName": "PlayerName",
      "leaguePoints": 89,
      "wins": 42,
      "losses": 38,
      "veteran": false,
      "inactive": false,
      "freshBlood": true,
      "hotStreak": false
    }
  ]
}
```

**Types de queue** :

- `RANKED_SOLO_5x5` : Classé Solo/Duo
- `RANKED_FLEX_SR` : Classé Flex 5v5
- `RANKED_FLEX_TT` : Classé Flex 3v3 (désactivé)

**Tiers possibles** :

- `IRON`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `EMERALD`, `DIAMOND`, `MASTER`, `GRANDMASTER`, `CHALLENGER`

**Rangs possibles** :

- `IV`, `III`, `II`, `I` (sauf Master+)

**Exemple** :

```bash
curl "http://localhost:3333/lol/summoner/Faker/rank?region=kr"
curl "http://localhost:3333/lol/summoner/Faker-KR1/rank?region=kr"
curl "http://localhost:3333/lol/summoner/Caps/rank?region=euw1&tagLine=EUW"
```

---

### Masteries de Champions

```http
GET /lol/summoner/:summonerName/masteries
```

**Description** : Récupère les masteries de champions d'un invocateur avec les noms et images.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| summonerName | string | Nom d'invocateur (format: GameName, GameName-TagLine) |

**Paramètres Query** :
| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| region | string | Non | euw1 | Région du serveur |
| tagLine | string | Non | Auto | TagLine Riot - déduit de la région si absent |
| top | number | Non | 10 | Nombre de champions à retourner (max recommandé: 20) |

**Réponse Succès** (200) :

```json
{
  "summoner": {
    "name": "PlayerName",
    "gameName": "Faker",
    "tagLine": "KR1",
    "level": 347
  },
  "masteries": [
    {
      "championId": 103,
      "championLevel": 7,
      "championPoints": 245678,
      "lastPlayTime": 1705840234000,
      "championPointsSinceLastLevel": 23678,
      "championPointsUntilNextLevel": 0,
      "chestGranted": true,
      "tokensEarned": 0,
      "summonerId": "gJqxKELGlG8nR...",
      "championName": "Ahri",
      "championImage": "https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/Ahri.png"
    },
    {
      "championId": 64,
      "championLevel": 7,
      "championPoints": 198432,
      "lastPlayTime": 1705612345000,
      "championPointsSinceLastLevel": 12432,
      "championPointsUntilNextLevel": 0,
      "chestGranted": false,
      "tokensEarned": 2,
      "summonerId": "gJqxKELGlG8nR...",
      "championName": "Lee Sin",
      "championImage": "https://ddragon.leagueoflegends.com/cdn/14.1.1/img/champion/LeeSin.png"
    }
  ]
}
```

**Niveaux de maîtrise** :

- Niveau 1-4 : Points accumulés
- Niveau 5 : 21,600+ points
- Niveau 6 : 2 tokens M6 requis
- Niveau 7 : 3 tokens M7 requis

**Exemples** :

```bash
# Top 5 champions
curl "http://localhost:3333/lol/summoner/Faker/masteries?top=5&region=kr"

# Top 10 champions (défaut) avec tagLine
curl "http://localhost:3333/lol/summoner/Caps/masteries?region=euw1&tagLine=EUW"

# Format avec séparateur
curl "http://localhost:3333/lol/summoner/Faker-KR1/masteries?region=kr&top=3"
```

---

### Historique de Matchs

```http
GET /lol/summoner/:summonerName/matches
```

**Description** : Récupère la liste des IDs des derniers matchs d'un invocateur.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| summonerName | string | Nom d'invocateur (format: GameName, GameName-TagLine) |

**Paramètres Query** :
| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| region | string | Non | euw1 | Région du serveur |
| tagLine | string | Non | Auto | TagLine Riot - déduit de la région si absent |
| platform | string | Non | europe | Platform régionale |
| count | number | Non | 10 | Nombre de matchs (max: 100) |

**Réponse Succès** (200) :

```json
{
  "summoner": {
    "name": "PlayerName",
    "gameName": "Caps",
    "tagLine": "EUW",
    "puuid": "abc123-def456-ghi789..."
  },
  "matchIds": [
    "EUW1_6543210987",
    "EUW1_6543210986",
    "EUW1_6543210985",
    "EUW1_6543210984",
    "EUW1_6543210983"
  ],
  "count": 5
}
```

**Exemples** :

```bash
# 20 derniers matchs EUW
curl "http://localhost:3333/lol/summoner/Caps/matches?count=20&region=euw1&platform=europe"

# 5 derniers matchs KR avec tagLine
curl "http://localhost:3333/lol/summoner/Faker/matches?count=5&region=kr&platform=asia&tagLine=KR1"

# Format avec séparateur
curl "http://localhost:3333/lol/summoner/Faker-KR1/matches?count=10&region=kr&platform=asia"
```

---

### Détails d'un Match

```http
GET /lol/match/:matchId
```

**Description** : Récupère tous les détails d'un match spécifique.

**Paramètres Path** :
| Paramètre | Type | Description |
|-----------|------|-------------|
| matchId | string | ID du match (format: REGION_NUMBERS) |

**Paramètres Query** :
| Paramètre | Type | Requis | Défaut | Description |
|-----------|------|--------|--------|-------------|
| platform | string | Non | europe | Platform régionale |

**Réponse Succès** (200) :

```json
{
  "metadata": {
    "dataVersion": "2",
    "matchId": "EUW1_6543210987",
    "participants": [
      "abc123-def456...",
      "ghi789-jkl012...",
      ...
    ]
  },
  "info": {
    "gameCreation": 1705840234000,
    "gameDuration": 1847,
    "gameEndTimestamp": 1705842081000,
    "gameId": 6543210987,
    "gameMode": "CLASSIC",
    "gameName": "teambuilder-match-6543210987",
    "gameStartTimestamp": 1705840234000,
    "gameType": "MATCHED_GAME",
    "gameVersion": "14.1.524.2437",
    "mapId": 11,
    "platformId": "EUW1",
    "queueId": 420,
    "tournamentCode": "",
    "participants": [
      {
        "puuid": "abc123-def456...",
        "summonerName": "Player1",
        "championId": 103,
        "championName": "Ahri",
        "teamId": 100,
        "teamPosition": "MIDDLE",
        "kills": 12,
        "deaths": 3,
        "assists": 8,
        "totalDamageDealtToChampions": 24567,
        "goldEarned": 14234,
        "champLevel": 16,
        "item0": 3089,
        "item1": 3020,
        "item2": 3135,
        "item3": 3157,
        "item4": 3916,
        "item5": 3165,
        "item6": 3364,
        "totalMinionsKilled": 234,
        "neutralMinionsKilled": 12,
        "visionScore": 45,
        "win": true,
        "perks": { ... },
        "summoner1Id": 4,
        "summoner2Id": 14
      },
      ...
    ],
    "teams": [
      {
        "teamId": 100,
        "win": true,
        "bans": [
          { "championId": 350, "pickTurn": 1 },
          { "championId": 89, "pickTurn": 2 },
          ...
        ],
        "objectives": {
          "baron": { "first": true, "kills": 1 },
          "champion": { "first": true, "kills": 42 },
          "dragon": { "first": false, "kills": 2 },
          "inhibitor": { "first": true, "kills": 1 },
          "riftHerald": { "first": true, "kills": 1 },
          "tower": { "first": true, "kills": 8 }
        }
      },
      {
        "teamId": 200,
        "win": false,
        ...
      }
    ]
  }
}
```

**Types de queue (queueId)** :

- `420` : Ranked Solo/Duo
- `440` : Ranked Flex
- `400` : Normal Draft
- `430` : Normal Blind
- `450` : ARAM
- `700` : Clash
- `1700` : Arena

**Exemple** :

```bash
curl "http://localhost:3333/lol/match/EUW1_6543210987?platform=europe"
```

---

## Codes d'Erreur

### Erreurs HTTP Standard

| Code | Message               | Description                                     |
| ---- | --------------------- | ----------------------------------------------- |
| 200  | OK                    | Requête réussie                                 |
| 400  | Bad Request           | Paramètres invalides ou manquants               |
| 403  | Forbidden             | Accès refusé (OAuth ou API Key invalide)        |
| 404  | Not Found             | Ressource introuvable (joueur, champion, match) |
| 429  | Too Many Requests     | Rate limit dépassé (Riot API ou serveur)        |
| 500  | Internal Server Error | Erreur serveur interne                          |
| 503  | Service Unavailable   | Service temporairement indisponible (Riot API)  |

### Erreurs Spécifiques

#### Authentification

**Accès refusé Discord** :

```json
{
  "error": "access_denied",
  "message": "Discord access was denied"
}
```

**État OAuth invalide** :

```json
{
  "error": "state_mismatch",
  "message": "Request state validation failed"
}
```

**Erreur générale d'authentification** :

```json
{
  "error": "authentication_error",
  "message": "Authentication failed"
}
```

#### Riot API - Erreurs Joueur

**Joueur introuvable** :

```json
{
  "error": "summoner_not_found",
  "message": "Riot API Error (404): Account not found"
}
```

**Profil introuvable** :

```json
{
  "error": "profile_not_found",
  "message": "Riot API Error (404): Account not found"
}
```

**Rang introuvable** :

```json
{
  "error": "rank_not_found",
  "message": "Riot API Error (404): Summoner not found"
}
```

**Masteries introuvables** :

```json
{
  "error": "masteries_not_found",
  "message": "Riot API Error (404): Summoner not found"
}
```

**Matchs introuvables** :

```json
{
  "error": "matches_not_found",
  "message": "Riot API Error (404): Account not found"
}
```

#### Riot API - Erreurs Données Statiques

**Champion introuvable** :

```json
{
  "error": "champion_not_found",
  "message": "Champion does not exist"
}
```

**Match introuvable** :

```json
{
  "error": "match_not_found",
  "message": "Riot API Error (404): Match not found"
}
```

**Échec récupération champions** :

```json
{
  "error": "champions_fetch_failed",
  "message": "Failed to fetch champions from Data Dragon"
}
```

**Échec récupération items** :

```json
{
  "error": "items_fetch_failed",
  "message": "Failed to fetch items from Data Dragon"
}
```

**Échec récupération version** :

```json
{
  "error": "version_fetch_failed",
  "message": "Failed to fetch version from Data Dragon"
}
```

#### Riot API - Erreurs Système

**API Key expirée ou invalide** :

```json
{
  "error": "Riot API Error (403)",
  "message": "Forbidden - API Key expired or invalid"
}
```

**Rate limit dépassé** :

```json
{
  "error": "Riot API Error (429)",
  "message": "Rate limit exceeded"
}
```

_Note : En cas de 429, attendez 1-2 minutes avant de réessayer_

**Service Riot indisponible** :

```json
{
  "error": "Riot API Error (503)",
  "message": "Service unavailable"
}
```

### Gestion des Erreurs - Bonnes Pratiques

#### Frontend (JavaScript/TypeScript)

```javascript
async function fetchSummonerProfile(summonerName, region = 'euw1') {
  try {
    const response = await fetch(
      `https://api.beemobot.fr/lol/summoner/${encodeURIComponent(summonerName)}/profile?region=${region}`
    )

    if (!response.ok) {
      const error = await response.json()

      // Gestion spécifique par code d'erreur
      switch (response.status) {
        case 404:
          throw new Error(`Joueur "${summonerName}" introuvable sur ${region.toUpperCase()}`)
        case 429:
          throw new Error('Trop de requêtes, veuillez patienter quelques instants')
        case 403:
          throw new Error("API Key expirée, contactez l'administrateur")
        case 500:
          throw new Error('Erreur serveur, réessayez plus tard')
        default:
          throw new Error(error.message || 'Erreur inconnue')
      }
    }

    return await response.json()
  } catch (error) {
    console.error('Erreur récupération profil:', error)
    throw error
  }
}

// Utilisation avec gestion d'erreur
try {
  const profile = await fetchSummonerProfile('nunch-N7789', 'euw1')
  console.log('Profil récupéré:', profile)
} catch (error) {
  // Afficher message d'erreur à l'utilisateur
  alert(error.message)
}
```

#### Bot Discord (Discord.js)

```javascript
client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!profile')) {
    const args = message.content.split(' ')
    const summonerName = args[1]
    const region = args[2] || 'euw1'

    try {
      const { data } = await axios.get(`${API_URL}/lol/summoner/${summonerName}/profile`, {
        params: { region },
      })

      // Créer et envoyer l'embed avec les données
      const embed = createProfileEmbed(data)
      message.reply({ embeds: [embed] })
    } catch (error) {
      // Gestion des erreurs avec messages utilisateur
      if (error.response) {
        switch (error.response.status) {
          case 404:
            message.reply(
              `❌ Joueur "${summonerName}" introuvable sur ${region.toUpperCase()}. Vérifiez le nom et le tagLine.`
            )
            break
          case 429:
            message.reply('⏳ Trop de requêtes, patientez 1 minute et réessayez.')
            break
          case 403:
            message.reply('🔒 API Key expirée, contactez un administrateur.')
            break
          default:
            message.reply(`❌ Erreur: ${error.response.data.message}`)
        }
      } else {
        message.reply('❌ Erreur réseau, vérifiez votre connexion.')
      }
    }
  }
})
```

---

## Rate Limiting

### Limites Riot API

L'API utilise la Riot Games API qui impose des limites strictes selon le type de clé :

#### Clé de Développement (Gratuite)

- **20 requêtes par seconde**
- **100 requêtes par 2 minutes**
- Expire toutes les **24 heures** (renouvellement manuel requis)
- Idéal pour : développement, tests, petits projets

#### Clé de Production (Sur demande)

- **3,000 requêtes par 10 secondes**
- **180,000 requêtes par 10 minutes**
- Pas d'expiration
- Idéal pour : applications en production, bots Discord, sites web

### En-têtes de Rate Limit

L'API Riot renvoie des en-têtes pour suivre votre consommation :

```
X-App-Rate-Limit: 20:1,100:120
X-App-Rate-Limit-Count: 5:1,12:120
X-Method-Rate-Limit: 20:1,100:120
X-Method-Rate-Limit-Count: 3:1,8:120
```

### Recommandations pour le Frontend

#### 1. Implémentez un Cache

**Données statiques (Champions, Items)** : Cache de 1 heure minimum

```javascript
// Exemple avec localStorage
const CACHE_DURATION = 60 * 60 * 1000 // 1 heure

async function getCachedChampions() {
  const cached = localStorage.getItem('champions')

  if (cached) {
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < CACHE_DURATION) {
      return data
    }
  }

  // Récupérer depuis l'API
  const response = await fetch('https://api.beemobot.fr/lol/champions')
  const data = await response.json()

  localStorage.setItem(
    'champions',
    JSON.stringify({
      data,
      timestamp: Date.now(),
    })
  )

  return data
}
```

**Données dynamiques (Profils joueurs)** : Cache de 5-10 minutes

```javascript
const PROFILE_CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

async function getCachedProfile(summonerName, region) {
  const cacheKey = `profile_${summonerName}_${region}`
  const cached = sessionStorage.getItem(cacheKey)

  if (cached) {
    const { data, timestamp } = JSON.parse(cached)
    if (Date.now() - timestamp < PROFILE_CACHE_DURATION) {
      return data
    }
  }

  const response = await fetch(
    `https://api.beemobot.fr/lol/summoner/${summonerName}/profile?region=${region}`
  )
  const data = await response.json()

  sessionStorage.setItem(
    cacheKey,
    JSON.stringify({
      data,
      timestamp: Date.now(),
    })
  )

  return data
}
```

#### 2. Debouncing pour les Recherches

```javascript
// Éviter trop de requêtes lors de la saisie
function debounce(func, delay = 500) {
  let timeoutId
  return (...args) => {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => func(...args), delay)
  }
}

const searchSummoner = debounce(async (query) => {
  if (query.length < 3) return // Minimum 3 caractères

  try {
    const profile = await fetchSummonerProfile(query)
    displayProfile(profile)
  } catch (error) {
    displayError(error.message)
  }
}, 500)

// Utilisation
searchInput.addEventListener('input', (e) => {
  searchSummoner(e.target.value)
})
```

#### 3. Gestion du 429 (Rate Limit Exceeded)

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options)

      if (response.status === 429) {
        // Attendre avant de réessayer (exponential backoff)
        const waitTime = Math.pow(2, i) * 1000 // 1s, 2s, 4s
        console.log(`Rate limit atteint, attente de ${waitTime}ms...`)
        await new Promise((resolve) => setTimeout(resolve, waitTime))
        continue
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      if (i === maxRetries - 1) throw error
    }
  }
}
```

#### 4. Batch Requests (Requêtes Groupées)

```javascript
// Au lieu de faire une requête par joueur
async function getMultipleProfiles(summonerNames, region) {
  // ❌ Mauvais : N requêtes
  // for (const name of summonerNames) {
  //   await fetchProfile(name)
  // }

  // ✅ Bon : Requêtes parallèles avec limite
  const BATCH_SIZE = 5
  const results = []

  for (let i = 0; i < summonerNames.length; i += BATCH_SIZE) {
    const batch = summonerNames.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map((name) =>
        fetchSummonerProfile(name, region).catch((err) => ({ error: err.message }))
      )
    )
    results.push(...batchResults)

    // Pause entre chaque batch
    if (i + BATCH_SIZE < summonerNames.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return results
}
```

### Limites du Serveur BeemoBot

Le serveur BeemoBot n'impose pas de rate limit strict, mais il est recommandé de :

- **Ne pas dépasser 10 requêtes/seconde** par IP
- **Utiliser le cache** pour les données statiques
- **Espacer les requêtes** de profils (minimum 500ms entre chaque)

### Monitoring et Alertes

Si vous dépassez les limites, vous recevrez :

1. **En-tête `Retry-After`** dans la réponse 429
2. **Message d'erreur** avec délai d'attente recommandé
3. **Blocage temporaire** de 1-2 minutes si abus répété

---

## Régions et Platforms

### Régions (pour les données de joueurs)

| Code   | Région               | Exemple        |
| ------ | -------------------- | -------------- |
| `euw1` | Europe West          | `?region=euw1` |
| `eun1` | Europe Nordic & East | `?region=eun1` |
| `na1`  | North America        | `?region=na1`  |
| `kr`   | Korea                | `?region=kr`   |
| `br1`  | Brazil               | `?region=br1`  |
| `jp1`  | Japan                | `?region=jp1`  |
| `la1`  | Latin America North  | `?region=la1`  |
| `la2`  | Latin America South  | `?region=la2`  |
| `oc1`  | Oceania              | `?region=oc1`  |
| `tr1`  | Turkey               | `?region=tr1`  |
| `ru`   | Russia               | `?region=ru`   |

### Platforms (pour les matchs)

| Code       | Régions couvertes            | Exemple              |
| ---------- | ---------------------------- | -------------------- |
| `europe`   | EUW1, EUN1, TR1, RU          | `?platform=europe`   |
| `americas` | NA1, BR1, LA1, LA2           | `?platform=americas` |
| `asia`     | KR, JP1                      | `?platform=asia`     |
| `sea`      | OC1, PH2, SG2, TH2, TW2, VN2 | `?platform=sea`      |

---

## Exemples d'Intégration

## Exemples d'Intégration

### Frontend React (avec TypeScript)

#### Configuration de Base

```typescript
// api/beemobot.ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.beemobot.fr'

interface SummonerProfile {
  summoner: {
    puuid: string
    gameName: string
    tagLine: string
    summonerLevel: number
    profileIconId: number
  }
  ranks: Array<{
    queueType: string
    tier: string
    rank: string
    leaguePoints: number
    wins: number
    losses: number
    winRate: string
  }>
  topChampions: Array<{
    championName: string
    championLevel: number
    championPoints: number
    championImage: string
  }>
  recentMatches: Array<{
    participant: {
      championName: string
      kills: number
      deaths: number
      assists: number
      win: boolean
    }
  }>
}

export async function fetchSummonerProfile(
  summonerName: string,
  region: string = 'euw1'
): Promise<SummonerProfile> {
  const response = await fetch(
    `${API_BASE_URL}/lol/summoner/${encodeURIComponent(summonerName)}/profile?region=${region}`,
    {
      headers: {
        'Content-Type': 'application/json',
      },
      // Cache pendant 5 minutes
      next: { revalidate: 300 },
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch profile: ${response.statusText}`)
  }

  return response.json()
}
```

#### Composant React

```tsx
// components/SummonerProfile.tsx
import { useState, useEffect } from 'react'
import { fetchSummonerProfile } from '@/api/beemobot'

export default function SummonerProfile({ summonerName, region }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true)
        const data = await fetchSummonerProfile(summonerName, region)
        setProfile(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [summonerName, region])

  if (loading) return <div>Chargement du profil...</div>
  if (error) return <div>Erreur: {error}</div>
  if (!profile) return null

  const soloRank = profile.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5')

  return (
    <div className="summoner-profile">
      <div className="header">
        <img
          src={`https://ddragon.leagueoflegends.com/cdn/16.1.1/img/profileicon/${profile.summoner.profileIconId}.png`}
          alt="Profile Icon"
        />
        <div>
          <h1>
            {profile.summoner.gameName}#{profile.summoner.tagLine}
          </h1>
          <p>Niveau {profile.summoner.summonerLevel}</p>
        </div>
      </div>

      {soloRank && (
        <div className="rank">
          <h2>
            {soloRank.tier} {soloRank.rank}
          </h2>
          <p>{soloRank.leaguePoints} LP</p>
          <p>
            {soloRank.wins}V - {soloRank.losses}D ({soloRank.winRate}%)
          </p>
        </div>
      )}

      <div className="champions">
        <h3>Top Champions</h3>
        {profile.topChampions.map((champ) => (
          <div key={champ.championName} className="champion">
            <img src={champ.championImage} alt={champ.championName} />
            <div>
              <strong>{champ.championName}</strong>
              <p>
                M{champ.championLevel} - {champ.championPoints.toLocaleString()} pts
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="matches">
        <h3>Matchs Récents</h3>
        {profile.recentMatches.map((match, idx) => (
          <div key={idx} className={`match ${match.participant.win ? 'win' : 'loss'}`}>
            <span>{match.participant.championName}</span>
            <span>
              {match.participant.kills}/{match.participant.deaths}/{match.participant.assists}
            </span>
            <span>{match.participant.win ? 'Victoire' : 'Défaite'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

#### Hook Personnalisé

```typescript
// hooks/useSummonerProfile.ts
import { useState, useEffect } from 'react'
import { fetchSummonerProfile } from '@/api/beemobot'

export function useSummonerProfile(summonerName: string, region: string = 'euw1') {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!summonerName) return

    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const profile = await fetchSummonerProfile(summonerName, region)
        if (!cancelled) {
          setData(profile)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [summonerName, region])

  return { data, loading, error }
}

// Utilisation
function ProfilePage() {
  const { data: profile, loading, error } = useSummonerProfile('nunch-N7789', 'euw1')

  if (loading) return <Spinner />
  if (error) return <ErrorMessage message={error} />

  return <SummonerProfile profile={profile} />
}
```

### Bot Discord (Discord.js v14)

#### Commande Slash /profile

```javascript
// commands/profile.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js')
const axios = require('axios')

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription("Affiche le profil League of Legends d'un joueur")
    .addStringOption((option) =>
      option
        .setName('summoner')
        .setDescription("Nom d'invocateur (ex: nunch-N7789)")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('region')
        .setDescription('Région du serveur')
        .setRequired(false)
        .addChoices(
          { name: 'EUW', value: 'euw1' },
          { name: 'EUNE', value: 'eun1' },
          { name: 'NA', value: 'na1' },
          { name: 'KR', value: 'kr' },
          { name: 'BR', value: 'br1' }
        )
    ),

  async execute(interaction) {
    await interaction.deferReply()

    const summoner = interaction.options.getString('summoner')
    const region = interaction.options.getString('region') || 'euw1'

    try {
      const { data } = await axios.get(`https://api.beemobot.fr/lol/summoner/${summoner}/profile`, {
        params: { region },
      })

      const soloRank = data.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5')
      const flexRank = data.ranks.find((r) => r.queueType === 'RANKED_FLEX_SR')

      const embed = new EmbedBuilder()
        .setColor(soloRank?.tier === 'CHALLENGER' ? '#F4C430' : '#0099ff')
        .setTitle(`${data.summoner.gameName}#${data.summoner.tagLine}`)
        .setDescription(`Niveau ${data.summoner.summonerLevel} • ${region.toUpperCase()}`)
        .setThumbnail(
          `https://ddragon.leagueoflegends.com/cdn/16.1.1/img/profileicon/${data.summoner.profileIconId}.png`
        )

      // Rangs
      if (soloRank) {
        embed.addFields({
          name: '🏆 Ranked Solo/Duo',
          value:
            `**${soloRank.tier} ${soloRank.rank}** - ${soloRank.leaguePoints} LP\n` +
            `${soloRank.wins}V / ${soloRank.losses}D (${soloRank.winRate}% WR)` +
            (soloRank.hotStreak ? ' 🔥' : ''),
          inline: true,
        })
      }

      if (flexRank) {
        embed.addFields({
          name: '🎯 Ranked Flex',
          value:
            `**${flexRank.tier} ${flexRank.rank}** - ${flexRank.leaguePoints} LP\n` +
            `${flexRank.wins}V / ${flexRank.losses}D (${flexRank.winRate}% WR)`,
          inline: true,
        })
      }

      // Top 3 Champions
      if (data.topChampions.length > 0) {
        const championsText = data.topChampions
          .slice(0, 3)
          .map(
            (champ, idx) =>
              `${idx + 1}. **${champ.championName}** - M${champ.championLevel} (${(champ.championPoints / 1000).toFixed(0)}k pts)`
          )
          .join('\n')

        embed.addFields({
          name: '🎮 Top Champions',
          value: championsText,
          inline: false,
        })
      }

      // Derniers matchs
      if (data.recentMatches.length > 0) {
        const matchesText = data.recentMatches
          .slice(0, 5)
          .map((match, idx) => {
            const p = match.participant
            const kda = p.deaths === 0 ? 'Perfect' : ((p.kills + p.assists) / p.deaths).toFixed(2)
            const result = p.win ? '✅' : '❌'
            return `${result} ${p.championName} • ${p.kills}/${p.deaths}/${p.assists} (${kda} KDA)`
          })
          .join('\n')

        embed.addFields({
          name: '⚔️ Matchs Récents',
          value: matchesText,
          inline: false,
        })
      }

      embed.setFooter({
        text: 'BeemoBot • Données Riot Games',
        iconURL: 'https://i.imgur.com/BeemoIcon.png',
      })
      embed.setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (error) {
      console.error('Erreur profil:', error)

      const errorEmbed = new EmbedBuilder().setColor('#ff0000').setTitle('❌ Erreur')

      if (error.response?.status === 404) {
        errorEmbed.setDescription(
          `Joueur **${summoner}** introuvable sur ${region.toUpperCase()}.\n\n` +
            `Vérifiez le format: \`GameName-TagLine\` (ex: \`nunch-N7789\`)`
        )
      } else if (error.response?.status === 429) {
        errorEmbed.setDescription('⏳ Trop de requêtes, patientez 1 minute.')
      } else {
        errorEmbed.setDescription('Erreur lors de la récupération du profil.')
      }

      await interaction.editReply({ embeds: [errorEmbed] })
    }
  },
}
```

### Vue.js 3 (Composition API)

```vue
<!-- components/SummonerProfile.vue -->
<template>
  <div class="summoner-profile">
    <div v-if="loading" class="loading">
      <span>Chargement...</span>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
    </div>

    <div v-else-if="profile" class="content">
      <div class="header">
        <img
          :src="`https://ddragon.leagueoflegends.com/cdn/16.1.1/img/profileicon/${profile.summoner.profileIconId}.png`"
          :alt="profile.summoner.gameName"
        />
        <div>
          <h1>{{ profile.summoner.gameName }}#{{ profile.summoner.tagLine }}</h1>
          <p>Niveau {{ profile.summoner.summonerLevel }}</p>
        </div>
      </div>

      <div v-if="soloRank" class="rank">
        <h2>{{ soloRank.tier }} {{ soloRank.rank }}</h2>
        <p>{{ soloRank.leaguePoints }} LP</p>
        <p>{{ soloRank.wins }}V - {{ soloRank.losses }}D ({{ soloRank.winRate }}%)</p>
      </div>

      <div class="champions">
        <h3>Top Champions</h3>
        <div v-for="champ in profile.topChampions" :key="champ.championName" class="champion">
          <img :src="champ.championImage" :alt="champ.championName" />
          <div>
            <strong>{{ champ.championName }}</strong>
            <p>M{{ champ.championLevel }} - {{ formatPoints(champ.championPoints) }} pts</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  summonerName: { type: String, required: true },
  region: { type: String, default: 'euw1' },
})

const profile = ref(null)
const loading = ref(false)
const error = ref(null)

const soloRank = computed(() => profile.value?.ranks.find((r) => r.queueType === 'RANKED_SOLO_5x5'))

async function fetchProfile() {
  loading.value = true
  error.value = null

  try {
    const response = await fetch(
      `https://api.beemobot.fr/lol/summoner/${encodeURIComponent(props.summonerName)}/profile?region=${props.region}`
    )

    if (!response.ok) {
      throw new Error('Joueur introuvable')
    }

    profile.value = await response.json()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

function formatPoints(points) {
  return points >= 1000 ? `${(points / 1000).toFixed(0)}k` : points
}

onMounted(() => {
  fetchProfile()
})
</script>

<style scoped>
.summoner-profile {
  padding: 20px;
}

.header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.header img {
  width: 80px;
  height: 80px;
  border-radius: 50%;
}

.rank {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 12px;
  margin-bottom: 24px;
}

.champion {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 8px;
  background: #f5f5f5;
  margin-bottom: 8px;
}

.champion img {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}
</style>
```

---

## 🎨 URLs d'Images et Assets

### Icônes de Profil

```
https://ddragon.leagueoflegends.com/cdn/16.1.1/img/profileicon/{profileIconId}.png
```

**Exemple** :

```javascript
const iconUrl = `https://ddragon.leagueoflegends.com/cdn/16.1.1/img/profileicon/${profile.summoner.profileIconId}.png`
```

### Images Champions

```
https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/{championName}.png
```

**Note** : Les images champions sont déjà incluses dans les réponses `/profile` et `/masteries` sous `championImage`.

### Images Items

```
https://ddragon.leagueoflegends.com/cdn/16.1.1/img/item/{itemId}.png
```

**Exemple** :

```javascript
// Afficher les items d'un participant
match.participant.items.map((itemId) => {
  if (itemId === 0) return null // Slot vide
  return `https://ddragon.leagueoflegends.com/cdn/16.1.1/img/item/${itemId}.png`
})
```

---

## 📊 Exemples JSON Complets

### Profil Complet

**Endpoint** : `GET /lol/summoner/nunch-N7789/profile?region=euw1`

```json
{
  "summoner": {
    "puuid": "gWihzHy8KsMAdAuE28wyFxwpjvku-5Ogm7swAkwZLGz4yzAZ0PIUETkGudFe2MaXCqe2e1v9nzq5Bw",
    "name": "Nunch",
    "gameName": "Nunch",
    "tagLine": "N7789",
    "profileIconId": 3804,
    "summonerLevel": 624,
    "revisionDate": 1768947979591
  },
  "ranks": [
    {
      "queueType": "RANKED_FLEX_SR",
      "tier": "PLATINUM",
      "rank": "II",
      "leaguePoints": 14,
      "wins": 7,
      "losses": 14,
      "winRate": "33.3",
      "hotStreak": false,
      "veteran": false,
      "freshBlood": false
    }
  ],
  "topChampions": [
    {
      "championId": 523,
      "championName": "Aphelios",
      "championImage": "https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/Aphelios.png",
      "championLevel": 52,
      "championPoints": 580911,
      "chestGranted": true,
      "lastPlayTime": 1768159205000
    },
    {
      "championId": 64,
      "championName": "Lee Sin",
      "championImage": "https://ddragon.leagueoflegends.com/cdn/16.1.1/img/champion/LeeSin.png",
      "championLevel": 21,
      "championPoints": 230318,
      "chestGranted": false,
      "lastPlayTime": 1768179710000
    }
  ],
  "recentMatches": [
    {
      "matchId": "EUW1_7690940162",
      "gameMode": "CLASSIC",
      "gameCreation": 1768750589388,
      "gameDuration": 912,
      "participant": {
        "championName": "Yunara",
        "championId": 804,
        "kills": 6,
        "deaths": 4,
        "assists": 2,
        "totalDamageDealtToChampions": 8224,
        "goldEarned": 7528,
        "champLevel": 9,
        "totalMinionsKilled": 114,
        "visionScore": 14,
        "win": false,
        "items": [1055, 6672, 3085, 0, 0, 0, 3340],
        "teamPosition": "BOTTOM"
      }
    }
  ],
  "totalMatches": 10
}
```

**Calculs utiles** :

```javascript
// KDA
const kda =
  participant.deaths === 0
    ? 'Perfect'
    : ((participant.kills + participant.assists) / participant.deaths).toFixed(2)

// CS par minute
const csPerMin = (participant.totalMinionsKilled / (gameDuration / 60)).toFixed(1)

// Gold par minute
const goldPerMin = (participant.goldEarned / (gameDuration / 60)).toFixed(0)

// Winrate
const winRate = ((wins / (wins + losses)) * 100).toFixed(1)
```

### Informations Joueur

**Endpoint** : `GET /lol/summoner/Faker-KR1?region=kr`

```json
{
  "id": "gJqxKELGlG8nR7...",
  "accountId": "5LlxqKKLqabc...",
  "puuid": "AxiCrh1fc65hQGDm81xmmWItsdFhWXaMejdnqEpaPwlUpzwOc_T5Ke8mdxtokGtjN2VGcf9omcWQcA",
  "name": "Faker",
  "profileIconId": 6,
  "revisionDate": 1765867271000,
  "summonerLevel": 22,
  "gameName": "Faker",
  "tagLine": "KR1"
}
```

**Affichage recommandé** :

```javascript
const displayName = `${data.gameName}#${data.tagLine}` // "Faker#KR1"
```

---

## 💻 Exemples d'Intégration Avancés

### TypeScript - Hook React Custom

```typescript
// hooks/useSummonerProfile.ts
import { useState, useEffect } from 'react'

interface Profile {
  summoner: {
    gameName: string
    tagLine: string
    summonerLevel: number
    profileIconId: number
  }
  ranks: Array<{
    queueType: string
    tier: string
    rank: string
    leaguePoints: number
    winRate: string
  }>
  topChampions: Array<{
    championName: string
    championPoints: number
    championImage: string
  }>
}

export function useSummonerProfile(name: string, region = 'euw1') {
  const [data, setData] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!name) return

    const fetchProfile = async () => {
      setLoading(true)
      setError(null)

      try {
        const res = await fetch(
          `https://api.beemobot.fr/lol/summoner/${encodeURIComponent(name)}/profile?region=${region}`
        )

        if (!res.ok) {
          throw new Error('Joueur introuvable')
        }

        const profile = await res.json()
        setData(profile)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [name, region])

  return { data, loading, error }
}
```

### Service API Complet

```typescript
// services/beemobot.ts
const API_URL = 'https://api.beemobot.fr'

export class BeemoBotAPI {
  private baseUrl: string

  constructor(baseUrl = API_URL) {
    this.baseUrl = baseUrl
  }

  async getProfile(summonerName: string, region = 'euw1') {
    const response = await fetch(
      `${this.baseUrl}/lol/summoner/${encodeURIComponent(summonerName)}/profile?region=${region}`
    )

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Erreur API')
    }

    return response.json()
  }

  async getChampions() {
    const response = await fetch(`${this.baseUrl}/lol/champions`)
    return response.json()
  }

  async getMatchDetails(matchId: string, platform = 'europe') {
    const response = await fetch(`${this.baseUrl}/lol/match/${matchId}?platform=${platform}`)
    return response.json()
  }
}

// Utilisation
const api = new BeemoBotAPI()

try {
  const profile = await api.getProfile('nunch-N7789', 'euw1')
  console.log(profile)
} catch (error) {
  console.error('Erreur:', error.message)
}
```

### Composant Vue 3 Complet

```vue
<!-- components/SummonerProfile.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'

const props = defineProps<{
  summonerName: string
  region?: string
}>()

const profile = ref(null)
const loading = ref(false)
const error = ref(null)

async function loadProfile() {
  loading.value = true
  error.value = null

  try {
    const res = await fetch(
      `https://api.beemobot.fr/lol/summoner/${encodeURIComponent(props.summonerName)}/profile?region=${props.region || 'euw1'}`
    )

    if (!res.ok) throw new Error('Joueur introuvable')

    profile.value = await res.json()
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadProfile()
})
</script>

<template>
  <div v-if="loading">Chargement...</div>
  <div v-else-if="error">{{ error }}</div>
  <div v-else-if="profile">
    <h1>{{ profile.summoner.gameName }}#{{ profile.summoner.tagLine }}</h1>
    <p>Niveau {{ profile.summoner.summonerLevel }}</p>
    <!-- Afficher les données -->
  </div>
</template>
```

### Gestion Avancée des Erreurs

```typescript
async function fetchWithErrorHandling(url: string) {
  try {
    const response = await fetch(url)

    switch (response.status) {
      case 200:
        return await response.json()

      case 404:
        throw new Error('Joueur introuvable. Vérifiez le nom et la région.')

      case 429:
        throw new Error('Trop de requêtes. Patientez 1 minute.')

      case 403:
        throw new Error("Clé API invalide. Contactez l'administrateur.")

      case 500:
        throw new Error('Erreur serveur. Réessayez dans quelques instants.')

      default:
        const error = await response.json()
        throw new Error(error.message || 'Erreur inconnue')
    }
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('Erreur réseau. Vérifiez votre connexion.')
    }
    throw err
  }
}
```

---

## 💡 Bonnes Pratiques

### ✅ À FAIRE

```typescript
// 1. Utiliser l'endpoint /profile pour un profil complet
const profile = await fetch('/lol/summoner/nunch-N7789/profile?region=euw1')

// 2. Encoder les noms d'invocateurs
const name = encodeURIComponent('Player-123')

// 3. Cache les données statiques (champions, items)
const champions = await getCachedChampions() // Cache 1h

// 4. Gérer les erreurs proprement
try {
  const data = await fetchProfile()
} catch (error) {
  showErrorMessage(error.message)
}

// 5. Debounce les recherches
const debouncedSearch = debounce(search, 500)
```

### ❌ À ÉVITER

```typescript
// 1. NE PAS faire 4 requêtes séparées
// ❌ Mauvais
const summoner = await fetch('/lol/summoner/...')
const ranks = await fetch('/lol/summoner/.../rank')
const masteries = await fetch('/lol/summoner/.../masteries')
const matches = await fetch('/lol/summoner/.../matches')

// ✅ Bon : 1 seule requête
const profile = await fetch('/lol/summoner/.../profile')

// 2. NE PAS oublier d'encoder les URLs
// ❌ Mauvais
fetch(`/lol/summoner/${name}`) // Si name contient des caractères spéciaux

// ✅ Bon
fetch(`/lol/summoner/${encodeURIComponent(name)}`)

// 3. NE PAS ignorer les erreurs
// ❌ Mauvais
const data = await fetch(url).then((r) => r.json())

// ✅ Bon
if (!response.ok) throw new Error('...')
```

---

## 🔧 Configuration Environnement

### Variables d'Environnement

```bash
# .env.local (Next.js)
NEXT_PUBLIC_API_URL=https://api.beemobot.fr

# .env (Vite)
VITE_API_URL=https://api.beemobot.fr

# .env (React Native)
EXPO_PUBLIC_API_URL=https://api.beemobot.fr
```

### Configuration TypeScript

```typescript
// config/api.ts
export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3333',
  defaultRegion: 'euw1',
  cacheDuration: {
    static: 60 * 60 * 1000, // 1 heure pour champions/items
    dynamic: 5 * 60 * 1000, // 5 minutes pour profils
  },
}
```

---

## 🚀 Endpoint Profil - Détails Techniques

### Avantages vs Endpoints Séparés

#### ❌ Ancienne méthode (4+ requêtes)

```bash
# 1. Infos de base
curl "/lol/summoner/nunch-N7789?region=euw1"

# 2. Ranks
curl "/lol/summoner/nunch-N7789/rank?region=euw1"

# 3. Masteries
curl "/lol/summoner/nunch-N7789/masteries?region=euw1&top=5"

# 4. Matchs
curl "/lol/summoner/nunch-N7789/matches?region=euw1&platform=europe&count=10"

# Puis pour chaque match, récupérer les détails...
```

**Problèmes** :

- 4+ requêtes HTTP séparées
- Latence cumulée (4x temps de réponse)
- Complexité côté client
- Rate limit Riot API atteint plus rapidement

#### ✅ Nouvelle méthode (1 requête)

```bash
curl "/lol/summoner/nunch-N7789/profile?region=euw1&platform=europe"
```

**Avantages** :

- ✅ 1 seule requête HTTP
- ✅ Requêtes parallèles côté serveur (plus rapide)
- ✅ Réponse structurée et cohérente
- ✅ Optimisé pour l'affichage de profil
- ✅ Winrate calculé automatiquement
- ✅ Images champions incluses

### Performance

**Temps de Réponse** :

- Sans cache : ~2-3 secondes (4 requêtes Riot API en parallèle)
- Avec cache : ~500ms (données statiques cachées)

**Optimisations Internes** :

1. Requêtes parallèles : `Promise.all()` pour ranks, masteries, matchs
2. Limitation des détails : Seulement 5 matchs détaillés (même si `matchCount` > 5)
3. Enrichissement intelligent : Champions enrichis avec noms/images depuis Data Dragon

### Migration depuis les anciens endpoints

**Avant** :

```javascript
// Multiple requests
const summoner = await fetch(`/lol/summoner/${name}?region=${region}`)
const ranks = await fetch(`/lol/summoner/${name}/rank?region=${region}`)
const masteries = await fetch(`/lol/summoner/${name}/masteries?region=${region}&top=5`)
const matches = await fetch(`/lol/summoner/${name}/matches?region=${region}&count=10`)
```

**Après** :

```javascript
// Single request
const profile = await fetch(`/lol/summoner/${name}/profile?region=${region}`)
// profile contient : summoner, ranks, topChampions, recentMatches
```

---

## 📚 Ressources et Support

### Documentation Officielle

- **Riot Games API** : https://developer.riotgames.com/
- **Data Dragon** : https://developer.riotgames.com/docs/lol#data-dragon
- **Discord Developer** : https://discord.com/developers/docs
- **AdonisJS** : https://docs.adonisjs.com/

### Endpoints de Référence

| Endpoint                      | Description     | Documentation                                  |
| ----------------------------- | --------------- | ---------------------------------------------- |
| `/lol/summoner/:name/profile` | Profil complet  | [Voir section](#profil-complet-dun-invocateur) |
| `/lol/summoner/:name`         | Infos basiques  | [Voir section](#informations-dun-invocateur)   |
| `/lol/summoner/:name/rank`    | Rangs classés   | [Voir section](#rang-dun-invocateur)           |
| `/lol/champions`              | Liste champions | [Voir section](#liste-des-champions)           |
| `/lol/match/:id`              | Détails match   | [Voir section](#détails-dun-match)             |

### Liens Utiles

- **Statut Riot API** : https://status.riotgames.com/
- **Communauté Discord** : [Rejoindre le serveur](#)
- **GitHub Repository** : https://github.com/BeemoBot-Enterprise/beemobot-api
- **Signaler un Bug** : [Issues GitHub](#)

### Support Technique

Pour toute question ou problème :

1. **Consultez la documentation** ci-dessus
2. **Vérifiez les exemples** d'intégration
3. **Testez avec curl** pour isoler le problème
4. **Contactez l'équipe** si le problème persiste

### Notes Importantes

⚠️ **API Key Riot** : Expire toutes les 24h en mode développement. Renouvelez-la sur le [Developer Portal](https://developer.riotgames.com/).

⚠️ **Riot ID obligatoire** : Utilisez le format `GameName-TagLine` (ex: `nunch-N7789`) pour éviter les erreurs 404.

⚠️ **Rate Limiting** : Implémentez un cache côté client pour les données statiques (champions, items).

⚠️ **CORS** : L'API autorise les requêtes cross-origin. Pas besoin de proxy en développement.

⚠️ **Cache recommandé** : Pour `/profile`, cache de 5-10 minutes recommandé côté client.

---

**Dernière mise à jour** : 21 janvier 2026  
**Version de l'API** : 1.0.0  
**Maintenu par** : BeemoBot Team

**Changelog** :

- ✅ Ajout endpoint `/profile` (21/01/2026)
- ✅ Migration Riot ID système (20/01/2026)
- ✅ Support PUUID endpoints (20/01/2026)
