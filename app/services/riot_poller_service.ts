/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import MatchPollState from '#models/match_poll_state'
import RiotApiService, { RiotApiError } from '#services/riot_api_service'
import type { DmParticipant } from '#models/dm_queue_entry'

/**
 * Polls Riot match history for every linked user and enqueues DMs for new
 * matches into `dm_queue`. Replaces the old Python `worker/riot_poller.py`.
 */
export default class RiotPollerService {
  private riot = new RiotApiService()

  async pollAll(): Promise<{ usersPolled: number; dmsEnqueued: number }> {
    const users = await User.query()
      .whereNotNull('riotPuuid')
      .whereNotNull('linkedAt')
      .select('id', 'discordId', 'riotPuuid')

    let dmsEnqueued = 0
    for (const user of users) {
      try {
        dmsEnqueued += await this.pollUser(user.discordId!, user.riotPuuid!)
      } catch (err) {
        if (err instanceof RiotApiError) {
          logger.warn(
            { puuid: user.riotPuuid, status: err.statusCode },
            'riot poll skipped one user'
          )
        } else {
          logger.error({ err, puuid: user.riotPuuid }, 'riot poll failed for user')
        }
      }
    }

    logger.info({ usersPolled: users.length, dmsEnqueued }, 'riot pollAll done')
    return { usersPolled: users.length, dmsEnqueued }
  }

  private async pollUser(discordId: string, puuid: string): Promise<number> {
    const state = await MatchPollState.find(puuid)
    const lastSeen = state?.lastPolledMatchId ?? null

    const matchIds = await this.riot.getMatchHistory(puuid, 'europe', 0, 10)
    if (!matchIds || matchIds.length === 0) return 0

    const newMatches: string[] = []
    for (const id of matchIds) {
      if (id === lastSeen) break
      newMatches.push(id)
    }
    if (newMatches.length === 0) return 0

    let inserted = 0
    for (const matchId of newMatches) {
      const details = await this.riot.getMatchDetails(matchId, 'europe')
      if (!details?.info?.participants) continue

      const participants: any[] = details.info.participants
      const others = (selfPuuid: string): DmParticipant[] =>
        participants
          .filter((p) => p.puuid !== selfPuuid)
          .map((p) => ({
            puuid: p.puuid,
            championName: p.championName,
            kills: p.kills,
            deaths: p.deaths,
            assists: p.assists,
            win: p.win,
            teamId: p.teamId,
          }))

      // Only enqueue for the user we're polling (others are polled in their own iteration).
      // ON CONFLICT keeps idempotency if the same match is seen twice.
      const result = await db.rawQuery(
        `INSERT INTO dm_queue (discord_id, match_id, participants)
         VALUES (?, ?, ?::jsonb)
         ON CONFLICT (discord_id, match_id) DO NOTHING
         RETURNING id`,
        [discordId, matchId, JSON.stringify(others(puuid))]
      )
      // pg returns { rows: [...] }; mysql returns array directly. We're on pg.
      inserted += result.rows?.length ?? 0
    }

    // Persist the newest match id we saw so next poll only picks up newer ones.
    await MatchPollState.updateOrCreate(
      { userPuuid: puuid },
      { userPuuid: puuid, lastPolledMatchId: newMatches[0] }
    )

    return inserted
  }
}
