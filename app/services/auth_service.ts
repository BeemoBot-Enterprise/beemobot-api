/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import RiotLinkChallenge from '#models/riot_link_challenge'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import { linkRiotValidator } from '#validators/auth'
import RiotApiService, { RiotApiError, RiotRegion } from '#services/riot_api_service'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

// Pool d'icônes universellement disponibles (level-based, débloquées dès le niveau 1-30).
// Évite de demander une icône esports/event que le user ne posséderait pas.
const CHALLENGE_ICON_POOL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28]
const CHALLENGE_TTL_SECONDS = 600 // 10 min

// A "stub" user is a placeholder created by RepService when someone gets shroom'd /
// respect'd before they've linked: it carries the PUUID + Riot pseudo so leaderboards
// don't show "Compte non lié", but no discord_id and no linked_at. Stubs never count
// as owning a Riot account — the link flow merges them into the linker's user.
function isStubUser(u: User | null | undefined): boolean {
  return !!u && u.linkedAt === null && !u.discordId
}

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

  private handleRiotError(
    err: unknown,
    response: HttpContext['response'],
    payload: { gameName: string; tagLine: string; region: string }
  ) {
    if (err instanceof RiotApiError) {
      if (err.statusCode === 404) {
        return response.status(404).json({
          error: 'riot_id_not_found',
          message: `Riot ID "${payload.gameName}#${payload.tagLine}" introuvable sur ${payload.region.toUpperCase()}. Vérifie l'orthographe et la région.`,
        })
      }
      const status =
        err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502
      return response.status(status).json({
        error: 'riot_api_error',
        message: err.publicMessage,
      })
    }
    throw err
  }

  public async previewLink({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(linkRiotValidator)
    const user = auth.user
    if (!user) {
      return response.status(401).json({ error: 'unauthenticated' })
    }
    const riot = new RiotApiService(payload.region)
    let account
    let summoner
    try {
      account = await riot.getAccountByRiotId(payload.gameName, payload.tagLine)
      summoner = await riot.getSummonerByPuuid(account.puuid)
    } catch (err) {
      return this.handleRiotError(err, response, payload)
    }

    const owner = await User.findBy('riotPuuid', account.puuid)
    const realOwner = isStubUser(owner) ? null : owner
    const alreadyLinkedByOther = !!realOwner && realOwner.id !== user.id
    const alreadyLinkedByMe = !!realOwner && realOwner.id === user.id

    const phantomRow = await db
      .from('reputation_events')
      .where('receiver_puuid', account.puuid)
      .count('* as cnt')
    const phantomTotal = Number(phantomRow[0].cnt ?? 0)

    return response.json({
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      region: payload.region,
      alreadyLinkedByOther,
      alreadyLinkedByMe,
      phantomEvents: phantomTotal,
    })
  }

  public async createLinkChallenge({ request, response, auth }: HttpContext) {
    const payload = await request.validateUsing(linkRiotValidator)
    const user = auth.user
    if (!user) {
      return response.status(401).json({ error: 'unauthenticated' })
    }

    const riot = new RiotApiService(payload.region)
    let account
    let summoner
    try {
      account = await riot.getAccountByRiotId(payload.gameName, payload.tagLine)
      summoner = await riot.getSummonerByPuuid(account.puuid)
    } catch (err) {
      return this.handleRiotError(err, response, payload)
    }

    // Refus si déjà lié à un autre user — même check que dans verify. Les stubs
    // (créés par RepService pour des unlinked) ne comptent pas comme owner.
    const owner = await User.findBy('riotPuuid', account.puuid)
    if (owner && !isStubUser(owner) && owner.id !== user.id) {
      return response.status(409).json({
        error: 'already_linked',
        message: `Ce compte Riot est déjà lié à un autre profil BeemoBot. Si tu penses qu'il a été usurpé, contacte le support.`,
      })
    }

    // Choisir une icône différente de l'actuelle pour forcer un changement réel.
    const candidates = CHALLENGE_ICON_POOL.filter((id) => id !== summoner.profileIconId)
    const expectedIconId = candidates[Math.floor(Math.random() * candidates.length)]

    // Invalider les challenges en cours pour ce user (un seul actif à la fois).
    await RiotLinkChallenge.query().where('user_id', user.id).delete()

    const expiresAt = DateTime.now().plus({ seconds: CHALLENGE_TTL_SECONDS })
    await RiotLinkChallenge.create({
      userId: user.id,
      puuid: account.puuid,
      gameName: account.gameName,
      tagLine: account.tagLine,
      region: payload.region,
      expectedIconId,
      previousIconId: summoner.profileIconId,
      expiresAt,
    })

    return response.json({
      expectedIconId,
      previousIconId: summoner.profileIconId,
      gameName: account.gameName,
      tagLine: account.tagLine,
      region: payload.region,
      expiresAt: expiresAt.toISO(),
      ttlSeconds: CHALLENGE_TTL_SECONDS,
    })
  }

  public async verifyLinkChallenge({ response, auth }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).json({ error: 'unauthenticated' })
    }

    const challenge = await RiotLinkChallenge.query()
      .where('user_id', user.id)
      .orderBy('created_at', 'desc')
      .first()

    if (!challenge) {
      return response.status(404).json({
        error: 'no_challenge',
        message: `Aucun challenge en cours. Recommence depuis la recherche.`,
      })
    }

    if (challenge.expiresAt < DateTime.now()) {
      await challenge.delete()
      return response.status(410).json({
        error: 'challenge_expired',
        message: `Le challenge a expiré. Recommence depuis la recherche.`,
      })
    }

    // Re-check duplicate au moment de la vérif (au cas où quelqu'un d'autre a lié entre temps).
    // Un stub (créé par un rep avant que le joueur ne lie) n'est pas un owner légitime —
    // on le supprimera juste avant le save pour libérer la contrainte UNIQUE sur riot_puuid.
    const owner = await User.findBy('riotPuuid', challenge.puuid)
    if (owner && !isStubUser(owner) && owner.id !== user.id) {
      await challenge.delete()
      return response.status(409).json({
        error: 'already_linked',
        message: `Ce compte Riot a été lié à un autre profil entre-temps. Contacte le support si tu penses qu'il a été usurpé.`,
      })
    }

    const riot = new RiotApiService(challenge.region as RiotRegion)
    let summoner
    try {
      summoner = await riot.getSummonerByPuuid(challenge.puuid)
    } catch (err) {
      return this.handleRiotError(err, response, {
        gameName: challenge.gameName,
        tagLine: challenge.tagLine,
        region: challenge.region,
      })
    }

    if (summoner.profileIconId !== challenge.expectedIconId) {
      return response.status(409).json({
        error: 'icon_mismatch',
        message: `On ne voit pas encore la bonne icône. Patiente 30s puis réessaie. (Attendu : ${challenge.expectedIconId}, vu : ${summoner.profileIconId})`,
        currentIconId: summoner.profileIconId,
        expectedIconId: challenge.expectedIconId,
      })
    }

    // Vérification OK → liaison. Si un stub porte le PUUID, on l'absorbe (delete)
    // pour libérer la contrainte UNIQUE avant d'écrire sur le user authentifié.
    if (owner && isStubUser(owner) && owner.id !== user.id) {
      await owner.delete()
    }
    user.riotPuuid = challenge.puuid
    user.riotGameName = challenge.gameName
    user.riotTagLine = challenge.tagLine
    user.riotRegion = challenge.region
    user.linkedAt = DateTime.now()
    await user.save()

    const previousIconId = challenge.previousIconId
    await challenge.delete()

    const phantomRow = await db
      .from('reputation_events')
      .where('receiver_puuid', user.riotPuuid)
      .count('* as cnt')
    const phantomTotal = Number(phantomRow[0].cnt ?? 0)

    return response.json({
      puuid: user.riotPuuid,
      gameName: user.riotGameName,
      tagLine: user.riotTagLine,
      previousIconId,
      phantomEvents: phantomTotal,
    })
  }

  public async unlinkRiotAccount({ response, auth }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.status(401).json({ error: 'unauthenticated' })
    }
    user.riotPuuid = null
    user.riotGameName = null
    user.riotTagLine = null
    user.riotRegion = null
    user.linkedAt = null
    await user.save()
    return response.json({ ok: true })
  }

  public async handleGenerateAccessToken({ response }: HttpContext, user: User) {
    const token = await User.accessTokens.create(user)
    return response.status(200).json({
      user: user,
      token: token,
    })
  }
}
