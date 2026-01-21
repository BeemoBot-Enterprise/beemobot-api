/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { Oauth2Driver, type ApiRequestContract, type RedirectRequestContract } from '@adonisjs/ally'

export interface RiotToken {
  token: string
  type: 'bearer'
}

export interface RiotUser {
  puuid: string
  gameName: string
  tagLine: string
}

export interface RiotScopes {
  openid?: boolean
}

export type RiotConfig = {
  driver: 'RiotOauth2'
  clientId: string
  clientSecret: string
  callbackUrl: string
  authorizeUrl?: string
  accessTokenUrl?: string
  userInfoUrl?: string
  scopes?: string[]
}

export class RiotOauth2 extends Oauth2Driver<RiotToken, RiotScopes> {
  protected authorizeUrl = 'https://auth.riotgames.com/authorize'
  protected accessTokenUrl = 'https://auth.riotgames.com/token'
  protected userInfoUrl = 'https://americas.api.riotgames.com/riot/account/v1/accounts/me'
  protected codeParamName = 'code'
  protected errorParamName = 'error'
  protected stateCookieName = 'riot_oauth_state'
  protected stateParamName = 'state'
  protected scopeParamName = 'scope'
  protected scopesSeparator = ' '

  constructor(
    ctx: HttpContext,
    public config: RiotConfig
  ) {
    super(ctx, config)

    if (config.authorizeUrl) {
      this.authorizeUrl = config.authorizeUrl
    }
    if (config.accessTokenUrl) {
      this.accessTokenUrl = config.accessTokenUrl
    }
    if (config.userInfoUrl) {
      this.userInfoUrl = config.userInfoUrl
    }
  }

  protected configureRedirectRequest(request: RedirectRequestContract<RiotScopes>) {
    request.scopes(this.config.scopes || ['openid'])
    request.param('response_type', 'code')
  }

  async accessToken(callback?: (request: ApiRequestContract) => void) {
    return this.getAccessToken(callback)
  }

  async user(callback?: (request: ApiRequestContract) => void) {
    const token = await this.accessToken(callback)
    const user = await this.getUserInfo(token.token, callback)

    return {
      id: user.puuid,
      name: user.gameName,
      nickName: `${user.gameName}#${user.tagLine}`,
      email: '',
      emailVerificationState: 'unsupported' as const,
      avatarUrl: null,
      original: user,
      token: {
        token: token.token,
        type: 'bearer' as const,
      },
    }
  }

  async userFromToken(token: string, callback?: (request: ApiRequestContract) => void) {
    const user = await this.getUserInfo(token, callback)

    return {
      id: user.puuid,
      name: user.gameName,
      nickName: `${user.gameName}#${user.tagLine}`,
      email: '',
      emailVerificationState: 'unsupported' as const,
      avatarUrl: null,
      original: user,
      token: {
        token: token,
        type: 'bearer' as const,
      },
    }
  }

  protected async getUserInfo(token: string, callback?: (request: ApiRequestContract) => void) {
    const request = this.httpClient(this.userInfoUrl)
    request.header('Authorization', `Bearer ${token}`)
    request.header('Accept', 'application/json')
    request.parseAs('json')

    if (typeof callback === 'function') {
      callback(request)
    }

    const response = await request.get()
    return response as RiotUser
  }
}
