/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DmQueueEntry from '#models/dm_queue_entry'

const MAX_ATTEMPTS = 3

export default class WorkerController {
  /**
   * GET /worker/dm-queue/pending?limit=20
   * Returns the oldest pending DMs that still have attempts left.
   */
  async listPendingDms({ request, response }: HttpContext) {
    const limit = Math.min(Number(request.qs().limit ?? 20), 100)
    const rows = await DmQueueEntry.query()
      .where('status', 'pending')
      .where('attempts', '<', MAX_ATTEMPTS)
      .orderBy('createdAt', 'asc')
      .limit(limit)
    return response.json({
      items: rows.map((r) => ({
        id: r.id,
        discordId: r.discordId,
        matchId: r.matchId,
        participants: r.participants,
        attempts: r.attempts,
      })),
    })
  }

  /** POST /worker/dm-queue/:id/sent */
  async markDmSent({ params, response }: HttpContext) {
    const entry = await DmQueueEntry.find(params.id)
    if (!entry) return response.status(404).json({ error: 'not_found' })
    entry.status = 'sent'
    entry.sentAt = DateTime.now()
    await entry.save()
    return response.json({ ok: true })
  }

  /** POST /worker/dm-queue/:id/failed  body: { error: string } */
  async markDmFailed({ params, request, response }: HttpContext) {
    const entry = await DmQueueEntry.find(params.id)
    if (!entry) return response.status(404).json({ error: 'not_found' })
    const errorMsg = String(request.input('error', 'unknown')).slice(0, 200)
    entry.attempts = entry.attempts + 1
    entry.lastError = errorMsg
    if (entry.attempts >= MAX_ATTEMPTS) entry.status = 'failed'
    await entry.save()
    return response.json({ ok: true, attempts: entry.attempts, status: entry.status })
  }

  /** POST /worker/dm-queue/:id/forbidden — user closed DMs, never retry */
  async markDmForbidden({ params, response }: HttpContext) {
    const entry = await DmQueueEntry.find(params.id)
    if (!entry) return response.status(404).json({ error: 'not_found' })
    entry.status = 'failed'
    entry.lastError = 'dm_forbidden'
    entry.attempts = MAX_ATTEMPTS
    await entry.save()
    return response.json({ ok: true })
  }
}
