import { HttpContext } from '@adonisjs/core/http'
import AuthService from '#services/auth_service'
import User from "#models/user";

export default class AuthController {
  private authService = new AuthService()

  public async redirectToDiscord({ ally }: HttpContext) {
    return ally.use('discord').redirect()
  }

  public async discordCallback({ ally, response }: HttpContext) {
    // @ts-ignore
    return await this.authService.handleDiscordCallback({ ally, response })
  }

  public async generateAccessToken({ response }: HttpContext, user: User) {
    // @ts-ignore
    return await this.authService.handleGenerateAccessToken({ response }, user)
  }
}
