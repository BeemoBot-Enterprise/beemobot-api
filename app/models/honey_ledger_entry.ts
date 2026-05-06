/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type HoneyReason =
  | 'respect_received'
  | 'shroom_received'
  | 'daily_login'
  | 'minigame_win'
  | 'minigame_bet'
  | 'cosmetic_purchase'

export default class HoneyLedgerEntry extends BaseModel {
  static table = 'honey_ledger'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userPuuid: string

  @column()
  declare delta: number

  @column()
  declare reason: HoneyReason

  @column({
    prepare: (v) => (v == null ? null : JSON.stringify(v)),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  })
  declare metadata: Record<string, any> | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
