// app/Services/AuthService.ts
import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'

export default class AuthService {
  public async handleDiscordCallback({ ally, response }: HttpContext) {
    try {
      const discord = ally.use('discord')

      if (discord.accessDenied()) {
        return response.status(403).json({
          error: 'access_denied',
          message: 'Discord access was denied',
        })
      }

      if (discord.stateMisMatch()) {
        return response.status(400).json({
          error: 'state_mismatch',
          message: 'Request state validation failed',
        })
      }

      if (discord.hasError()) {
        return response.status(400).json({
          error: 'authentication_error',
          message: 'An error occurred during authentication',
        })
      }

      const discordUser = await discord.user()

      const user = await User.updateOrCreate(
        { discordId: discordUser.id },
        {
          discordId: discordUser.id,
          username: discordUser.name,
          email: discordUser.email || null,
          avatarUrl: discordUser.avatarUrl || null,
        }
      )

      const token = await User.accessTokens.create(user)

      return response.redirect('http://localhost:4321?token=' + token.value!.release())
    } catch (error) {
      return response.status(500).json({
        error: 'server_error',
        message: 'An error occurred during authentication',
      })
    }
  }
  public async handleGenerateAccessToken({ response }: HttpContext, user: User) {
    const token = await User.accessTokens.create(user)
    return response.status(200).json({
      user: user,
      token: token,
    })
  }
}
