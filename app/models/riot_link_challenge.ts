/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class RiotLinkChallenge extends BaseModel {
  static table = 'riot_link_challenges'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare puuid: string

  @column()
  declare gameName: string

  @column()
  declare tagLine: string

  @column()
  declare region: string

  @column()
  declare expectedIconId: number

  @column()
  declare previousIconId: number | null

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
