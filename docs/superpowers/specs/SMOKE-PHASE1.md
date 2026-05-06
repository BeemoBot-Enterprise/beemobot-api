# Smoke test — Phase 1 (MVP réactif)

End-to-end manual verification de la DoD Phase 1 : "Deux utilisateurs peuvent se shroomer mutuellement après une vraie game LoL via la commande `/judge` sur Discord."

## Pré-requis

- API qui tourne sur `http://localhost:3333` (`pnpm dev` dans `beemobot-api`, `node ace migration:run` à jour)
- Webapp qui tourne sur `http://localhost:3000` (`pnpm dev` dans `beemobot-webapp`, `.env.local` avec `NEXT_PUBLIC_API_URL=http://localhost:3333`)
- Bot qui tourne avec `BOT_TOKEN_TEST` + `RIOT_API_KEY` valides + `BEEMO_API_BASE_URL=http://localhost:3333` + `WEBAPP_URL=http://localhost:3000`
- 2 comptes Discord (A et B) avec accès au serveur de test
- 2 comptes Riot (Riot-A, Riot-B) ayant joué une game ensemble dans les 24 dernières heures (sinon pas de match dans la fenêtre Riot API)
- Discord OAuth configuré (clientId + secret + callback URL) dans le `.env` API

## Steps

1. [ ] **Auth Discord User A** : ouvrir `http://localhost:3000`, click "Login Discord", autoriser → redirect vers `/auth/callback?token=...` → automatiquement redirigé vers `/auth/link` (pas encore linké)

2. [ ] **Link Riot User A** : sur `/auth/link`, remplir gameName/tagLine/region pour Riot-A, soumettre → redirect vers `/u/Riot-A-Tag` qui affiche les compteurs vides

3. [ ] **Auth Discord User B** + **Link Riot User B** : idem pour B

4. [ ] **Vérifier sur Discord** : User A tape `/link` → reçoit l'embed avec le webapp URL (test que la commande répond, pas de double link nécessaire)

5. [ ] **`/judge` réactif (cœur de Phase 1)** : User A tape `/judge Riot-B-Tag` → reçoit la liste des matches éligibles avec User B avec boutons 🍄 Shroom + ⭐ Respect par match

6. [ ] **Donner un respect** : User A click ⭐ Respect sur le match commun → message "✅ Respect envoyé pour le match `EUW1_xxx` (weight 1.0)"

7. [ ] **Vérifier la persistance** : User B tape `/me Riot-B-Tag` sur Discord → embed affiche `⭐ Respects: 1` et `🍯 Honey: 10` (10 honey de récompense pour 1 respect reçu)

8. [ ] **Vérifier le webapp** : ouvrir `http://localhost:3000/u/Riot-B-Tag` (page publique) → affiche les mêmes valeurs

9. [ ] **Idempotence du quota** : User A retape `/judge Riot-B-Tag` → le bouton ⭐ Respect pour ce match commun N'APPARAÎT PLUS (slot used). Le bouton 🍄 Shroom reste dispo.

10. [ ] **Donner un shroom sur le même match** : User A click 🍄 Shroom → message succès → `/me Riot-B-Tag` montre `🍄 Shrooms: 1` et `🍯 Honey: 15` (10 + 5)

11. [ ] **Re-tentative bloquée** : User A retape `/judge Riot-B-Tag` → plus aucun bouton sur ce match (les deux types ont été utilisés)

✅ **Phase 1 validée si les 11 steps passent.**

## Things to verify in DB (optionnel, sanity)

```sql
-- 1 ligne respect + 1 ligne shroom pour User A → User B sur le match commun
SELECT type, giver_puuid, receiver_puuid, match_id, weight FROM reputation_events;

-- 2 entrées de honey pour User B (10 + 5 = 15)
SELECT user_puuid, delta, reason FROM honey_ledger ORDER BY created_at;

-- User A et User B ont linked_at non NULL
SELECT discord_id, riot_puuid, riot_game_name, linked_at FROM users WHERE linked_at IS NOT NULL;
```

## Failure modes connus

- **"Riot ID introuvable"** sur `/judge` ou `/me` → Riot API key expirée (renouveler sur https://developer.riotgames.com/)
- **"Aucun match commun trouvé"** sur `/judge` → vérifier que les 2 PUUIDs sont vraiment dans une game dans les 20 derniers matchs de A. La fenêtre des 20 matchs est petite ; si une game date de >2 semaines, elle peut tomber out.
- **"Token Discord manquant"** sur `/auth/link` → l'OAuth n'a pas écrit dans `localStorage["beemobot_token"]`. Vérifier `/auth/callback` et qu'on arrive bien avec `?token=...` dans l'URL.
- **CORS** → vérifier `ALLOWED_ORIGINS=http://localhost:3000` dans `.env` API + restart API.
