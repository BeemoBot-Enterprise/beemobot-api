/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import HoneyLedgerEntry, { HoneyReason } from '#models/honey_ledger_entry'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'

const DAILY_HONEY = 20

export default class HoneyService {
  static async tryDaily(user: User): Promise<boolean> {
    if (!user.riotPuuid) return false
    const today = DateTime.now().toISODate()
    if (user.lastDailyAt && user.lastDailyAt.toISODate() === today) return false
    await this.credit(user.riotPuuid, DAILY_HONEY, 'daily_login', { date: today })
    user.lastDailyAt = DateTime.fromISO(today!)
    await user.save()
    return true
  }

  static async credit(
    userPuuid: string,
    amount: number,
    reason: HoneyReason,
    metadata: Record<string, any> | null = null
  ) {
    if (amount <= 0) throw new Error('credit amount must be positive')
    return HoneyLedgerEntry.create({ userPuuid, delta: amount, reason, metadata })
  }

  static async debit(
    userPuuid: string,
    amount: number,
    reason: HoneyReason,
    metadata: Record<string, any> | null = null
  ) {
    if (amount <= 0) throw new Error('debit amount must be positive')
    return db.transaction(async (trx) => {
      const balance = await this.balance(userPuuid, trx)
      if (balance < amount) throw new Error('insufficient_honey')
      return HoneyLedgerEntry.create(
        { userPuuid, delta: -amount, reason, metadata },
        { client: trx }
      )
    })
  }

  static async balance(userPuuid: string, trx?: any): Promise<number> {
    const query = HoneyLedgerEntry.query({ client: trx })
      .where('userPuuid', userPuuid)
      .sum('delta as total')
    const row = await query
    return Number(row[0].$extras.total ?? 0)
  }
}
