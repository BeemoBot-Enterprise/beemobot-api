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

  public async previewLink(ctx: HttpContext) {
    // @ts-ignore
    return await this.authService.previewLink(ctx)
  }

  public async createLinkChallenge(ctx: HttpContext) {
    // @ts-ignore
    return await this.authService.createLinkChallenge(ctx)
  }

  public async verifyLinkChallenge(ctx: HttpContext) {
    // @ts-ignore
    return await this.authService.verifyLinkChallenge(ctx)
  }

  public async unlinkRiot(ctx: HttpContext) {
    // @ts-ignore
    return await this.authService.unlinkRiotAccount(ctx)
  }

  public async generateAccessToken({ response }: HttpContext, user: User) {
    // @ts-ignore
    return await this.authService.handleGenerateAccessToken({ response }, user)
  }
}
