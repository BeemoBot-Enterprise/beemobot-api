/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import HoneyService from '#services/honey_service'
import env from '#start/env'
import { spendValidator, creditValidator } from '#validators/economy'

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

  async spend({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (!user.riotPuuid) return response.status(409).json({ error: 'not_linked' })
    const payload = await request.validateUsing(spendValidator)
    try {
      await HoneyService.debit(user.riotPuuid, payload.amount, payload.reason, payload.metadata ?? null)
    } catch (error: any) {
      if (error.message === 'insufficient_honey') {
        return response.status(402).json({ error: 'insufficient_honey' })
      }
      throw error
    }
    const balance = await HoneyService.balance(user.riotPuuid)
    return response.json({ balance })
  }

  async credit({ request, response }: HttpContext) {
    const apiKey = request.header('x-internal-key')
    if (apiKey !== env.get('INTERNAL_API_KEY')) {
      return response.status(401).json({ error: 'forbidden' })
    }
    const payload = await request.validateUsing(creditValidator)
    await HoneyService.credit(payload.userPuuid, payload.amount, payload.reason, payload.metadata ?? null)
    return response.status(201).json({ ok: true })
  }
}
