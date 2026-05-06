/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import GuildSetting from '#models/guild_setting'

export default class AdminController {
  async getGuild({ params, response }: HttpContext) {
    const setting = await GuildSetting.find(params.guildId)
    return response.json(
      setting ?? { guildId: params.guildId, repEnabled: true, publicChannelId: null }
    )
  }

  async updateGuild({ params, request, response }: HttpContext) {
    const { repEnabled, publicChannelId } = request.only(['repEnabled', 'publicChannelId'])
    await GuildSetting.updateOrCreate(
      { guildId: params.guildId },
      { repEnabled, publicChannelId }
    )
    return response.json({ ok: true })
  }
}
