/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import LeaderboardService, { Period, LbType, Scope } from '#services/leaderboard_service'

const PERIODS: Period[] = ['week', 'month', 'all']
const TYPES: LbType[] = ['respects', 'shrooms', 'honey']
const SCOPES: Scope[] = ['global', 'guild']

export default class LeaderboardController {
  async list({ request, response }: HttpContext) {
    const period = (request.qs().period as Period) || 'week'
    const type = (request.qs().type as LbType) || 'respects'
    const scope = (request.qs().scope as Scope) || 'global'
    const guildId = request.qs().guildId as string | undefined

    if (!PERIODS.includes(period) || !TYPES.includes(type) || !SCOPES.includes(scope)) {
      return response.status(400).json({ error: 'invalid_params' })
    }
    const rows = await LeaderboardService.list(period, type, scope, guildId)
    return response.json({ period, type, scope, guildId: guildId ?? null, rows })
  }
}
