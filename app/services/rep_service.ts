/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import ReputationEvent, { RepType } from '#models/reputation_event'
import HoneyService from '#services/honey_service'
import RiotApiService, { RiotPlatform } from '#services/riot_api_service'
import db from '@adonisjs/lucid/services/db'

const HONEY_PER_RESPECT = 10
const HONEY_PER_SHROOM = 5
const WEIGHT_MAX_NET_REP = 50

export interface GiveRepInput {
  giverPuuid: string
  receiverPuuid: string
  matchId: string
  type: RepType
  guildId?: string | null
  reason?: string | null
}

export default class RepService {
  static async computeWeight(giverPuuid: string): Promise<number> {
    const rows = await db
      .from('reputation_events')
      .where('receiver_puuid', giverPuuid)
      .select(db.raw(`type, COUNT(*) as cnt`))
      .groupBy('type')

    let respects = 0
    let shrooms = 0
    for (const row of rows) {
      if (row.type === 'respect') respects = Number(row.cnt)
      if (row.type === 'shroom') shrooms = Number(row.cnt)
    }
    const netRep = Math.max(0, respects - shrooms)
    return Math.round((1 + Math.min(1, netRep / WEIGHT_MAX_NET_REP)) * 100) / 100
  }

  static async giveRep(input: GiveRepInput) {
    const weight = await this.computeWeight(input.giverPuuid)

    return db.transaction(async (trx) => {
      const event = await ReputationEvent.create(
        {
          type: input.type,
          giverPuuid: input.giverPuuid,
          receiverPuuid: input.receiverPuuid,
          matchId: input.matchId,
          guildId: input.guildId ?? null,
          reason: input.reason ?? null,
          weight,
        },
        { client: trx }
      )

      const honeyDelta = input.type === 'respect' ? HONEY_PER_RESPECT : HONEY_PER_SHROOM
      const honeyReason = input.type === 'respect' ? 'respect_received' : 'shroom_received'
      // NOTE: HoneyService.credit runs outside trx — Phase 1 known limitation.
      // If credit fails after event insert, honey won't be credited (but event exists).
      // Fix in Phase 2: extend HoneyService.credit to accept an optional trx parameter.
      await HoneyService.credit(input.receiverPuuid, honeyDelta, honeyReason, {
        match_id: input.matchId,
        rep_event_id: event.id,
      })

      return event
    })
  }

  /**
   * Returns match IDs where giver and receiver were both present AND
   * (type='shroom' or type='respect') has not yet been used.
   */
  static async listEligibleMatches(
    giverPuuid: string,
    receiverPuuid: string,
    region: RiotPlatform = 'europe'
  ): Promise<{ matchId: string; canShroom: boolean; canRespect: boolean }[]> {
    const riot = new RiotApiService()
    const matches = await riot.getMatchHistory(giverPuuid, region, 0, 20)

    const results = []
    for (const matchId of matches) {
      const details = await riot.getMatchDetails(matchId, region)
      const participants = details.info.participants.map((p: any) => p.puuid)
      if (!participants.includes(receiverPuuid)) continue

      const used = await db
        .from('reputation_events')
        .where({ giver_puuid: giverPuuid, receiver_puuid: receiverPuuid, match_id: matchId })
        .select('type')
      const usedTypes = new Set(used.map((u: any) => u.type))

      results.push({
        matchId,
        canShroom: !usedTypes.has('shroom'),
        canRespect: !usedTypes.has('respect'),
      })
    }
    return results
  }
}
