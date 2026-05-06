/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import Cosmetic from '#models/cosmetic'
import UserCosmetic from '#models/user_cosmetic'
import HoneyService from '#services/honey_service'
import { purchaseValidator } from '#validators/shop'

export default class ShopController {
  async list({ response }: HttpContext) {
    const items = await Cosmetic.all()
    return response.json({ items })
  }

  async owned({ auth, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) return response.status(409).json({ error: 'not_linked' })
    const owned = await UserCosmetic.query().where('userPuuid', user.riotPuuid)
    return response.json({ owned })
  }

  async purchase({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) return response.status(409).json({ error: 'not_linked' })
    const payload = await request.validateUsing(purchaseValidator)
    const cosmetic = await Cosmetic.find(payload.cosmeticId)
    if (!cosmetic) return response.status(404).json({ error: 'cosmetic_not_found' })

    const existing = await UserCosmetic.query()
      .where('userPuuid', user.riotPuuid)
      .where('cosmeticId', cosmetic.id)
      .first()
    if (existing) return response.status(409).json({ error: 'already_owned' })

    try {
      await HoneyService.debit(user.riotPuuid, cosmetic.priceHoney, 'cosmetic_purchase', {
        cosmetic_id: cosmetic.id,
      })
    } catch {
      return response.status(402).json({ error: 'insufficient_honey' })
    }
    const uc = await UserCosmetic.create({
      userPuuid: user.riotPuuid,
      cosmeticId: cosmetic.id,
      equipped: false,
    })
    return response.status(201).json({ ok: true, item: uc })
  }
}
