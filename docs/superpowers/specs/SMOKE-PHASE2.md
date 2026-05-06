# Smoke test — Phase 2 (Worker proactif)

End-to-end manual verification de la DoD Phase 2 : "Tu finis une game LoL, dans les 5 min tu reçois un DM Discord automatique avec les boutons shroom/respect pour chaque participant linké."

## Pré-requis

- Phase 1 fonctionne (cf. `SMOKE-PHASE1.md`)
- API + Webapp + Bot lancés localement
- `bot/.env` contient :
  - `BOT_TOKEN_TEST=...`
  - `RIOT_API_KEY=RGAPI-...` (la même que `beemobot-api/.env`)
  - `BEEMO_API_BASE_URL=http://localhost:3333`
  - `WEBAPP_URL=http://localhost:3000`
  - `DB_HOST=localhost`, `DB_PORT=5432`, `DB_DATABASE=postgres`, `DB_USER=postgres`, `DB_PASSWORD=...`
  - `WORKER_INTERVAL_S=60` (override pour tester rapidement, défaut = 300)
- 2 comptes Discord (A, B) avec leurs comptes Riot linkés (A→Riot-A, B→Riot-B), confirmé via `/u/Riot-A-Tag` qui montre `linked: true`
- Riot-A et Riot-B ont JUSTE FINI une game ensemble (matchID dans leurs 10 derniers matchs)

## Setup pour le test

Dans 2 terminaux séparés :

**Terminal 1 — Bot Discord (avec DM dispatcher)** :
```bash
cd bot
python main.py
# Attendre le message "Slash commands have been synced." + "Bot is ready as ..."
```

**Terminal 2 — Match Worker** :
```bash
cd bot
WORKER_INTERVAL_S=60 python -m worker.main
# Doit afficher "poll_all done: X new matches enqueued" toutes les 60s
```

## Steps

1. [ ] **Trigger initial poll** : avec User A et User B linkés et une game commune récente, attendre la première itération du worker (jusqu'à 60s).

2. [ ] **Vérifier la queue DB** :
   ```sql
   SELECT id, discord_id, match_id, status, attempts FROM dm_queue;
   ```
   Devrait contenir 2 lignes (une par user linké du match commun) avec `status='pending'`.

3. [ ] **Vérifier `match_poll_state`** :
   ```sql
   SELECT user_puuid, last_polled_match_id, last_polled_at FROM match_poll_state;
   ```
   Une ligne par user linké, `last_polled_match_id` mis à jour, `last_polled_at` récent.

4. [ ] **Réception DM** : User A reçoit dans les 30s suivantes un DM Discord du bot avec :
   - Embed titre `🎮 Game terminée — qui mérite quoi ?`
   - Description `Match \`EUW1_xxx\``
   - Champs par participant : champion + KDA + Win/Loss
   - Boutons 🍄 Shroom + ⭐ Respect par participant (max 8 participants UI)

5. [ ] **Idempotence** : User B reçoit aussi son DM (avec User A dans la liste, pas lui-même).

6. [ ] **Click bouton respect** : User A click ⭐ Respect sur User B → message éphémère "✅ Respect envoyé sur {champion}" → bouton désactivé.

7. [ ] **Vérifier rep created** :
   ```sql
   SELECT type, giver_puuid, receiver_puuid, match_id, weight FROM reputation_events ORDER BY id DESC LIMIT 5;
   ```
   Une ligne `respect` Riot-A → Riot-B sur le match commun.

8. [ ] **Status DM** : `SELECT status, sent_at FROM dm_queue;` → tous `sent` avec `sent_at` non null.

9. [ ] **Pas de double-DM** : retrigger le worker (attendre WORKER_INTERVAL_S) → AUCUNE nouvelle ligne `dm_queue` pour le même match (UNIQUE INDEX `(discord_id, match_id)` joue son rôle).

10. [ ] **Failure case — DM bloqué** : si User A a désactivé les DMs serveur, le dispatcher catch `discord.Forbidden` → `dm_queue.status = 'failed'`, `last_error = 'dm_forbidden'`.

✅ **Phase 2 validée si les 10 steps passent.**

## Métriques d'observabilité

Dans le terminal du worker, surveiller :
- `poll_all done: N new matches enqueued` (doit logger après chaque itération)
- `429 from Riot, sleeping Xs` (retry backoff sur rate limit — normal sous charge)
- `Riot returned 404 for ...` (match supprimé/inexistant — non bloquant)

Dans le terminal du bot, surveiller :
- `dm dispatch crashed` (NE devrait JAMAIS apparaître)
- Pas de stacktrace inattendue

## Failure modes connus

- **Worker crash au boot : `psycopg2.OperationalError`** → vérifier les vars DB dans `bot/.env`. Le worker partage la même DB que l'API.
- **Worker poll mais 0 inserts** → soit aucun user linké, soit aucune game récente partagée, soit `last_polled_match_id` déjà à jour.
- **Aucun DM reçu malgré une ligne `dm_queue.pending`** → le `dispatch_loop` n'est pas démarré. Vérifier que `Discord/bot.py` `on_ready` log "Bot is ready" (sinon le bot lui-même n'a pas démarré).
- **`429 from Riot`** répétés → la dev key Riot est saturée. Personal API key requise (cf. Task 2.1, demande externe ~1-2 sem).
- **`discord.Forbidden`** systématique → le user a bloqué les DMs serveur. Aucun fix côté bot ; Phase 4 ajoutera un fallback channel public optionnel.

## Performance attendue (dev key)

- Poll interval : 300s (5 min)
- Quota Riot : ~50 req / 2 min = ~0.4 req/s
- Avec 10 users linkés : ~10 polls × (1 history + 5 details moyens) ≈ 60 req / cycle = OK
- Avec 30 users : 30 × 6 = 180 req / 5 min = saturation. Mitigation : Personal API key OU polling moins fréquent.
