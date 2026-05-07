/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import db from '@adonisjs/lucid/services/db'

export type Period = 'week' | 'month' | 'all'
export type LbType = 'respects' | 'shrooms' | 'honey'
export type Scope = 'global' | 'guild'

const PERIOD_DAYS: Record<Period, number | null> = {
  week: 7,
  month: 30,
  all: null,
}

export default class LeaderboardService {
  static async list(period: Period, type: LbType, scope: Scope, guildId?: string, limit = 50) {
    if (type === 'honey') return this.listHoney(period, scope, guildId, limit)
    return this.listRep(period, type, scope, guildId, limit)
  }

  private static async listRep(period: Period, type: LbType, scope: Scope, guildId: string | undefined, limit: number) {
    const repType = type === 'respects' ? 'respect' : 'shroom'
    let query = db
      .from('reputation_events as r')
      .leftJoin('users as u', 'r.receiver_puuid', 'u.riot_puuid')
      .where('r.type', repType)
      .select('r.receiver_puuid as puuid')
      .select('u.riot_game_name as gameName')
      .select('u.riot_tag_line as tagLine')
      .select('u.username as username')
      .select('u.avatar_url as avatarUrl')
      .select('u.discord_id as discordId')
      .select(db.raw('COUNT(*) as count'))
      .select(db.raw('SUM(r.weight) as weighted'))
      .groupBy(
        'r.receiver_puuid',
        'u.riot_game_name',
        'u.riot_tag_line',
        'u.username',
        'u.avatar_url',
        'u.discord_id',
      )
      .orderBy('weighted', 'desc')
      .limit(limit)

    const days = PERIOD_DAYS[period]
    if (days != null) query = query.whereRaw(`r.created_at > NOW() - INTERVAL '${days} days'`)
    if (scope === 'guild' && guildId) query = query.where('r.guild_id', guildId)

    return query
  }

  private static async listHoney(period: Period, _scope: Scope, _guildId: string | undefined, limit: number) {
    let query = db
      .from('honey_ledger as h')
      .leftJoin('users as u', 'h.user_puuid', 'u.riot_puuid')
      .select('h.user_puuid as puuid')
      .select('u.riot_game_name as gameName')
      .select('u.riot_tag_line as tagLine')
      .select('u.username as username')
      .select('u.avatar_url as avatarUrl')
      .select('u.discord_id as discordId')
      .select(db.raw('SUM(h.delta) as honey'))
      .groupBy(
        'h.user_puuid',
        'u.riot_game_name',
        'u.riot_tag_line',
        'u.username',
        'u.avatar_url',
        'u.discord_id',
      )
      .orderBy('honey', 'desc')
      .limit(limit)

    const days = PERIOD_DAYS[period]
    if (days != null) query = query.whereRaw(`h.created_at > NOW() - INTERVAL '${days} days'`)
    return query
  }
}
