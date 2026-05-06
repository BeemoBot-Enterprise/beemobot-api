/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class UserCosmetic extends BaseModel {
  static table = 'user_cosmetics'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userPuuid: string

  @column()
  declare cosmeticId: string

  @column()
  declare equipped: boolean

  @column.dateTime({ autoCreate: true })
  declare purchasedAt: DateTime
}
