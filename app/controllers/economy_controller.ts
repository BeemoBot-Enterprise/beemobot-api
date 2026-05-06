/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import HoneyService from '#services/honey_service'

export default class EconomyController {
  async balance({ auth, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) {
      return response.status(409).json({ error: 'not_linked' })
    }
    const balance = await HoneyService.balance(user.riotPuuid)
    const recent = await HoneyLedgerEntry.query()
      .where('userPuuid', user.riotPuuid)
      .orderBy('createdAt', 'desc')
      .limit(20)
    return response.json({ balance, recent })
  }
}
