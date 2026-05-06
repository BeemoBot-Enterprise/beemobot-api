/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import HoneyLedgerEntry, { HoneyReason } from '#models/honey_ledger_entry'
import db from '@adonisjs/lucid/services/db'

export default class HoneyService {
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
