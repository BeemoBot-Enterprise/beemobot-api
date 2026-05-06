/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type RepType = 'shroom' | 'respect'

export default class ReputationEvent extends BaseModel {
  static table = 'reputation_events'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare type: RepType

  @column()
  declare giverPuuid: string

  @column()
  declare receiverPuuid: string

  @column()
  declare guildId: string | null

  @column()
  declare matchId: string

  @column()
  declare weight: number

  @column()
  declare reason: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
