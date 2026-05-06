/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import { eligibleQueryValidator, giveRepValidator } from '#validators/rep'
import RepService from '#services/rep_service'
import User from '#models/user'

export default class RepController {
  async eligible({ request, response }: HttpContext) {
    const qs = await eligibleQueryValidator.validate(request.qs())
    try {
      const matches = await RepService.listEligibleMatches(
        qs.giverPuuid,
        qs.receiverPuuid,
        qs.region
      )
      return response.json({ matches })
    } catch (error) {
      return response.status(502).json({ error: 'riot_api_unavailable' })
    }
  }

  async give({ request, response }: HttpContext) {
    const payload = await request.validateUsing(giveRepValidator)
    const giver = await User.findBy('discordId', payload.giverDiscordId)
    if (!giver?.riotPuuid || !giver.linkedAt) {
      return response.status(403).json({ error: 'giver_not_linked' })
    }
    try {
      const event = await RepService.giveRep({
        giverPuuid: giver.riotPuuid,
        receiverPuuid: payload.receiverPuuid,
        matchId: payload.matchId,
        type: payload.type,
        guildId: payload.guildId ?? null,
        reason: payload.reason ?? null,
      })
      return response.status(201).json({ id: event.id, weight: event.weight })
    } catch (error: any) {
      if (error.code === '23505') {
        return response.status(409).json({ error: 'already_given_for_this_match' })
      }
      throw error
    }
  }
}
