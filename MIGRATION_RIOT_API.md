<!--
Copyright (c) 2024-2026 BeemoBot Enterprise
All rights reserved.
-->

# Migration vers la nouvelle API Riot Games

## 📅 Date : Janvier 2026

## 🎯 Objectif

Mise à jour de l'API BeemoBot pour utiliser la dernière version de l'API Riot Games basée sur le système **Riot ID** (gameName + tagLine).

---

## ⚠️ Problèmes résolus

### Erreurs 403 (Forbidden)

Les erreurs 403 étaient causées par l'utilisation d'endpoints dépréciés :

- ❌ `/lol/summoner/v4/summoners/by-name/{summonerName}` → **DÉPRÉCIÉ**
- ❌ `/lol/league/v4/entries/by-summoner/{summonerId}` → **DÉPRÉCIÉ**

### Champs manquants

L'API Riot a supprimé certains champs des réponses :

- `id` (encryptedSummonerId) : Plus retourné par `/summoners/by-puuid`
- `accountId` : Plus retourné par `/summoners/by-puuid`
- `name` : Peut être vide ou absent

---

## ✅ Changements implémentés

### 1. Nouveau système d'authentification des joueurs

**Avant (déprécié) :**

```typescript
// ❌ Ne fonctionne plus
const summoner = await riotApi.getSummonerByName('Faker')
```

**Après (nouveau) :**

```typescript
// ✅ Utilise Riot ID (gameName + tagLine)
const account = await riotApi.getAccountByRiotId('Faker', 'KR1')
const summoner = await riotApi.getSummonerByPuuid(account.puuid)
```

### 2. Endpoints mis à jour

#### GET /lol/summoner/:summonerName

- **Changement** : Support du format `GameName-TagLine` ou paramètre `?tagLine=`
- **Exemple** :
  - `/lol/summoner/Faker-KR1?region=kr`
  - `/lol/summoner/Faker?region=kr&tagLine=KR1`
  - `/lol/summoner/Faker?region=kr` (tagLine auto = KR1)

#### GET /lol/summoner/:summonerName/rank

- **Changement** : Utilise `/league/v4/entries/by-puuid/{puuid}` au lieu de `by-summoner`
- **Fallback** : Ancien endpoint maintenu pour compatibilité

#### GET /lol/summoner/:summonerName/masteries

- **Changement** : Utilise le PUUID via Riot ID
- **Bonus** : Retourne maintenant `gameName` et `tagLine` dans la réponse

#### GET /lol/summoner/:summonerName/matches

- **Changement** : Utilise le PUUID via Riot ID
- **Bonus** : Retourne maintenant `gameName` et `tagLine` dans la réponse

### 3. Service RiotApiService

**Nouvelle méthode :**

```typescript
async getAccountByRiotId(gameName: string, tagLine: string): Promise<Account>
```

- Récupère le compte Riot avec le PUUID
- Utilise l'endpoint régional : `https://{platform}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`

**Méthode mise à jour :**

```typescript
async getSummonerRank(puuidOrSummonerId: string): Promise<Rank[]>
```

- Essaie d'abord `/league/v4/entries/by-puuid/{puuid}`
- Fallback vers `/league/v4/entries/by-summoner/{summonerId}` si échec

**Mapping automatique des tagLines :**

```typescript
const defaultTags: Record<string, string> = {
  euw1: 'EUW',
  eun1: 'EUNE',
  na1: 'NA1',
  kr: 'KR1',
  br1: 'BR1',
  jp1: 'JP1',
  la1: 'LAN',
  la2: 'LAS',
  oc1: 'OCE',
  tr1: 'TR1',
  ru: 'RU',
}
```

### 4. Controller LolController

**Nouvelle méthode helper :**

```typescript
private async getSummonerByRiotId(
  summonerName: string,
  region: RiotRegion,
  tagLineParam?: string
): Promise<{ account, summoner, riotApi }>
```

- Gère l'extraction de `gameName` et `tagLine` depuis le paramètre
- Supporte le format `GameName-TagLine` avec séparateur
- Applique le tagLine par défaut selon la région
- Retourne le compte, le summoner et l'instance API

---

## 📊 Réponses API mises à jour

### Avant

```json
{
  "summoner": {
    "name": "PlayerName",
    "level": 347
  },
  "ranks": [...]
}
```

### Après

```json
{
  "summoner": {
    "name": "PlayerName",
    "gameName": "Faker",
    "tagLine": "KR1",
    "level": 347
  },
  "ranks": [...]
}
```

---

## 🧪 Tests effectués

✅ `/lol/summoner/Faker?region=kr` → Succès (200)
✅ `/lol/summoner/Faker-KR1?region=kr` → Succès (200)
✅ `/lol/summoner/Caps?region=euw1` → Succès (200)
✅ `/lol/summoner/Caps/rank?region=euw1` → Succès (200)
✅ `/lol/summoner/Caps/masteries?region=euw1&top=3` → Succès (200)
✅ `/lol/summoner/Caps/matches?region=euw1&platform=europe&count=3` → Succès (200)

---

## 🔄 Rétrocompatibilité

### Ancien endpoint déprécié conservé

```typescript
async getSummonerByName(summonerName: string)
```

- ⚠️ **DÉPRÉCIÉ** : Ne doit plus être utilisé
- Peut causer des erreurs 403 selon les régions
- Conservé uniquement pour compatibilité temporaire

### Fallback automatique

Le système tente automatiquement les nouveaux endpoints en premier, puis fall back vers les anciens si nécessaire.

---

## 📚 Documentation mise à jour

- ✅ `API.md` : Tous les exemples mis à jour avec Riot ID
- ✅ Ajout de la section "Migration vers Riot ID"
- ✅ Exemples de requêtes cURL avec les nouveaux formats
- ✅ Documentation des tagLines par défaut

---

## 🚀 Prochaines étapes recommandées

1. **Supprimer les méthodes dépréciées** après période de transition
2. **Implémenter un cache Redis** pour les données de compte (gameName + tagLine → PUUID)
3. **Ajouter des tests unitaires** pour les nouveaux endpoints
4. **Monitorer les erreurs 403** pour détecter d'autres endpoints dépréciés
5. **Documenter les limites de rate** spécifiques aux nouveaux endpoints

---

## 📖 Ressources

- [Riot Developer Portal](https://developer.riotgames.com/)
- [Riot ID Documentation](https://developer.riotgames.com/docs/riot-games-api)
- [Account-v1 API](https://developer.riotgames.com/apis#account-v1)
- [League-v4 API](https://developer.riotgames.com/apis#league-v4)

---

**Dernière mise à jour** : Janvier 2026
**Maintenu par** : BeemoBot Team
