/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class MatchPollState extends BaseModel {
  static table = 'match_poll_state'

  // Composite-style PK on user_puuid (string)
  @column({ isPrimary: true })
  declare userPuuid: string

  @column()
  declare lastPolledMatchId: string | null

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare lastPolledAt: DateTime
}
