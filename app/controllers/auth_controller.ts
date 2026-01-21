/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import AuthService from '#services/auth_service'
import User from '#models/user'

export default class AuthController {
  private authService = new AuthService()

  public async redirectToDiscord({ ally }: HttpContext) {
    return ally.use('discord').redirect()
  }

  public async discordCallback({ ally, response }: HttpContext) {
    // @ts-ignore
    return await this.authService.handleDiscordCallback({ ally, response })
  }

  public async redirectToRiot({ ally }: HttpContext) {
    return ally.use('riot').redirect()
  }

  public async riotCallback({ ally, response }: HttpContext) {
    // @ts-ignore
    return await this.authService.handleRiotCallback({ ally, response })
  }

  public async generateAccessToken({ response }: HttpContext, user: User) {
    // @ts-ignore
    return await this.authService.handleGenerateAccessToken({ response }, user)
  }
}
