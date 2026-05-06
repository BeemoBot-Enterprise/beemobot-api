/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class Cosmetic extends BaseModel {
  @column({ isPrimary: true })
  declare id: string

  @column()
  declare name: string

  @column()
  declare type: string

  @column()
  declare assetUrl: string

  @column()
  declare priceHoney: number
}
