/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import HoneyService from '#services/honey_service'
import User from '#models/user'

export default class ProfileController {
  async show({ params, response }: HttpContext) {
    const puuid = params.puuid

    const counts = await db
      .from('reputation_events')
      .where('receiver_puuid', puuid)
      .select('type')
      .select(db.raw('COUNT(*) as cnt'))
      .select(db.raw('SUM(weight) as weighted'))
      .groupBy('type')

    let respects = 0
    let shrooms = 0
    let weightedRespects = 0
    let weightedShrooms = 0
    for (const row of counts) {
      if (row.type === 'respect') {
        respects = Number(row.cnt)
        weightedRespects = Number(row.weighted ?? 0)
      } else if (row.type === 'shroom') {
        shrooms = Number(row.cnt)
        weightedShrooms = Number(row.weighted ?? 0)
      }
    }

    const recentEvents = await db
      .from('reputation_events')
      .where('receiver_puuid', puuid)
      .orderBy('created_at', 'desc')
      .limit(20)

    const honey = await HoneyService.balance(puuid)

    const user = await User.findBy('riotPuuid', puuid)

    return response.json({
      puuid,
      gameName: user?.riotGameName ?? null,
      tagLine: user?.riotTagLine ?? null,
      linked: !!user?.linkedAt,
      counts: { respects, shrooms },
      weighted: { respects: weightedRespects, shrooms: weightedShrooms },
      honey,
      recentEvents,
    })
  }
}
