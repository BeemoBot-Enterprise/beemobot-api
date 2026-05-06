/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class GuildSetting extends BaseModel {
  static table = 'guild_settings'

  @column({ isPrimary: true })
  declare guildId: string

  @column()
  declare repEnabled: boolean

  @column()
  declare publicChannelId: string | null
}
