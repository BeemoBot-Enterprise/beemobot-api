/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { linkRiotValidator } from '#validators/auth'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

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

      return response.redirect(
        `${env.get('WEBAPP_URL')}/auth/callback?token=${token.value!.release()}`
      )
    } catch (error) {
      logger.error({ err: error }, 'Discord OAuth callback failed')
      return response.status(500).json({
        error: 'server_error',
        message: 'An error occurred during authentication',
      })
    }
  }

  public async linkRiotAccount({
    request,
    response,
    auth,
  }: HttpContext) {
    const payload = await request.validateUsing(linkRiotValidator)
    const user = auth.user
    if (!user) {
      return response.status(401).json({ error: 'unauthenticated' })
    }
    const riot = new RiotApiService(payload.region)
    const account = await riot.getAccountByRiotId(payload.gameName, payload.tagLine)

    user.riotPuuid = account.puuid
    user.riotGameName = account.gameName
    user.riotTagLine = account.tagLine
    user.linkedAt = DateTime.now()
    await user.save()

    const phantomRow = await db
      .from('reputation_events')
      .where('receiver_puuid', account.puuid)
      .count('* as cnt')
    const phantomTotal = Number(phantomRow[0].cnt ?? 0)

    return response.json({
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      phantomEvents: phantomTotal,
    })
  }

  public async handleGenerateAccessToken({ response }: HttpContext, user: User) {
    const token = await User.accessTokens.create(user)
    return response.status(200).json({
      user: user,
      token: token,
    })
  }
}
