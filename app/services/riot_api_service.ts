/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import env from '#start/env'
import logger from '@adonisjs/core/services/logger'
import Cache from '#services/cache'

export type RiotRegion =
  | 'euw1'
  | 'na1'
  | 'kr'
  | 'br1'
  | 'eun1'
  | 'jp1'
  | 'la1'
  | 'la2'
  | 'oc1'
  | 'ru'
  | 'tr1'
export type RiotPlatform = 'europe' | 'americas' | 'asia' | 'sea'

export class RiotApiError extends Error {
  readonly statusCode: number
  readonly publicMessage: string

  constructor(statusCode: number, rawBody: string, overrideMessage?: string) {
    const publicMessage = overrideMessage ?? RiotApiError.statusToMessage(statusCode)
    super(publicMessage)
    this.name = 'RiotApiError'
    this.statusCode = statusCode
    this.publicMessage = publicMessage
    // Raw body kept on the error for server-side logs only — never serialized to client.
    Object.defineProperty(this, 'rawBody', { value: rawBody, enumerable: false })
  }

  static unreachable(reason: string): RiotApiError {
    return new RiotApiError(
      503,
      reason,
      "API Riot injoignable depuis le serveur. Vérifie ta connexion / VPN / firewall, puis réessaie."
    )
  }

  private static statusToMessage(status: number): string {
    if (status === 404) return 'Not found'
    if (status === 401 || status === 403) return 'Riot API authentication failed'
    if (status === 429) return 'Riot API rate limit exceeded'
    if (status >= 500) return 'Riot API is unavailable'
    return 'Riot API request failed'
  }
}

export default class RiotApiService {
  private apiKey: string
  private baseUrl: string
  private platform: RiotPlatform

  constructor(region: RiotRegion = 'euw1') {
    this.apiKey = env.get('RIOT_API_KEY')
    this.baseUrl = `https://${region}.api.riotgames.com`
    this.platform = this.getPlatformFromRegion(region)
  }

  private getPlatformFromRegion(region: RiotRegion): RiotPlatform {
    const platformMap: Record<RiotRegion, RiotPlatform> = {
      euw1: 'europe',
      eun1: 'europe',
      tr1: 'europe',
      ru: 'europe',
      na1: 'americas',
      br1: 'americas',
      la1: 'americas',
      la2: 'americas',
      kr: 'asia',
      jp1: 'asia',
      oc1: 'sea',
    }
    return platformMap[region]
  }

  private async makeRequest<T>(url: string): Promise<T> {
    let response
    try {
      response = await fetch(url, {
        headers: {
          'X-Riot-Token': this.apiKey,
        },
      })
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      logger.warn({ url, err: reason }, 'Riot API unreachable (network/TLS)')
      throw RiotApiError.unreachable(reason)
    }

    if (!response.ok) {
      const body = await response.text()
      logger.warn({ url, status: response.status, body }, 'Riot API request failed')
      throw new RiotApiError(response.status, body)
    }

    return response.json() as Promise<T>
  }

  /**
   * Récupère les informations d'un compte Riot par gameName et tagLine
   */
  async getAccountByRiotId(gameName: string, tagLine: string = 'EUW') {
    const platformUrl = `https://${this.platform}.api.riotgames.com`
    const url = `${platformUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
    return this.makeRequest<{
      puuid: string
      gameName: string
      tagLine: string
    }>(url)
  }

  /**
   * Récupère gameName / tagLine à partir d'un PUUID (Account v1).
   */
  async getAccountByPuuid(puuid: string) {
    const platformUrl = `https://${this.platform}.api.riotgames.com`
    const url = `${platformUrl}/riot/account/v1/accounts/by-puuid/${encodeURIComponent(puuid)}`
    return this.makeRequest<{
      puuid: string
      gameName: string
      tagLine: string
    }>(url)
  }

  /**
   * Récupère les informations d'un joueur par son PUUID
   */
  async getSummonerByPuuid(puuid: string) {
    const url = `${this.baseUrl}/lol/summoner/v4/summoners/by-puuid/${puuid}`
    return this.makeRequest<{
      id?: string // Optionnel car déprécié
      accountId?: string // Optionnel car déprécié
      puuid: string
      name?: string // Optionnel car peut être vide
      profileIconId: number
      revisionDate: number
      summonerLevel: number
    }>(url)
  }

  /**
   * Récupère le rang d'un joueur par son PUUID
   * Note: L'ancien endpoint by-summoner est déprécié, utilisez by-puuid
   */
  async getSummonerRank(puuidOrSummonerId: string) {
    // Essayer d'abord avec le PUUID (nouveau endpoint)
    try {
      const url = `${this.baseUrl}/lol/league/v4/entries/by-puuid/${puuidOrSummonerId}`
      return await this.makeRequest<
        Array<{
          leagueId: string
          queueType: string
          tier: string
          rank: string
          summonerId: string
          leaguePoints: number
          wins: number
          losses: number
          veteran: boolean
          inactive: boolean
          freshBlood: boolean
          hotStreak: boolean
        }>
      >(url)
    } catch (error) {
      // Fallback vers l'ancien endpoint si le PUUID ne fonctionne pas
      const urlLegacy = `${this.baseUrl}/lol/league/v4/entries/by-summoner/${puuidOrSummonerId}`
      return this.makeRequest<
        Array<{
          leagueId: string
          queueType: string
          tier: string
          rank: string
          summonerId: string
          summonerName: string
          leaguePoints: number
          wins: number
          losses: number
          veteran: boolean
          inactive: boolean
          freshBlood: boolean
          hotStreak: boolean
        }>
      >(urlLegacy)
    }
  }

  /**
   * Récupère les masteries de champions d'un joueur
   */
  async getChampionMasteries(puuid: string) {
    const url = `${this.baseUrl}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}`
    return this.makeRequest<
      Array<{
        championId: number
        championLevel: number
        championPoints: number
        lastPlayTime: number
        championPointsSinceLastLevel: number
        championPointsUntilNextLevel: number
        chestGranted: boolean
        tokensEarned: number
        summonerId: string
      }>
    >(url)
  }

  /**
   * Récupère les masteries de champions d'un joueur (top N)
   */
  async getTopChampionMasteries(puuid: string, count: number = 10) {
    const url = `${this.baseUrl}/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=${count}`
    return this.makeRequest<
      Array<{
        championId: number
        championLevel: number
        championPoints: number
        lastPlayTime: number
        championPointsSinceLastLevel: number
        championPointsUntilNextLevel: number
        chestGranted: boolean
        tokensEarned: number
        summonerId: string
      }>
    >(url)
  }

  /**
   * Récupère la liste des matchs d'un joueur
   */
  async getMatchHistory(
    puuid: string,
    platform: RiotPlatform = 'europe',
    start: number = 0,
    count: number = 20
  ) {
    const regionalUrl = `https://${platform}.api.riotgames.com`
    const url = `${regionalUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`
    return this.makeRequest<string[]>(url)
  }

  /**
   * Récupère les détails d'un match
   */
  async getMatchDetails(matchId: string, platform: RiotPlatform = 'europe') {
    const regionalUrl = `https://${platform}.api.riotgames.com`
    const url = `${regionalUrl}/lol/match/v5/matches/${matchId}`
    return this.makeRequest<any>(url)
  }

  /**
   * Récupère les informations d'un champion par son ID
   * Note: Utilise Data Dragon car l'API ne fournit pas directement les infos de champions
   */
  async getChampionById(championId: number) {
    const data = await this.fetchDataDragon<{ data: Record<string, any> }>(
      `data/fr_FR/champion.json`
    )

    for (const champion of Object.values(data.data)) {
      if (parseInt(champion.key) === championId) {
        return champion
      }
    }

    return null
  }

  /**
   * Récupère tous les champions
   */
  async getAllChampions() {
    const version = await this.getLatestVersion()
    return Cache.memo(`ddragon:champions:${version}`, 3600, async () => {
      const data = await this.fetchDataDragon<{ data: Record<string, any> }>(`data/fr_FR/champion.json`)
      return data.data
    })
  }

  /**
   * Récupère les détails complets d'un champion
   */
  async getChampionDetails(championName: string) {
    const data = await this.fetchDataDragon<{ data: Record<string, any> }>(
      `data/fr_FR/champion/${championName}.json`
    )
    return data.data[championName]
  }

  /**
   * Récupère la dernière version de Data Dragon
   */
  async getLatestVersion(): Promise<string> {
    return Cache.memo('ddragon:latest', 3600, async () => {
      const url = `${RiotApiService.DDRAGON_BASE}/api/versions.json`
      try {
        const versions = (await fetch(url).then((r) => r.json())) as string[]
        return versions[0]
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err)
        logger.warn({ url, err: reason }, 'Data Dragon unreachable')
        throw RiotApiError.unreachable(reason)
      }
    })
  }

  /**
   * Récupère l'URL de l'icône d'un champion
   */
  async getChampionIcon(championName: string): Promise<string> {
    const version = await this.getLatestVersion()
    return `${RiotApiService.DDRAGON_BASE}/cdn/${version}/img/champion/${championName}.png`
  }

  /**
   * Récupère l'URL du splash art d'un champion
   */
  getChampionSplash(championName: string, skinNum: number = 0): string {
    return `${RiotApiService.DDRAGON_BASE}/cdn/img/champion/splash/${championName}_${skinNum}.jpg`
  }

  /**
   * Récupère l'URL de l'icône d'un objet
   */
  async getItemIcon(itemId: number): Promise<string> {
    const version = await this.getLatestVersion()
    return `${RiotApiService.DDRAGON_BASE}/cdn/${version}/img/item/${itemId}.png`
  }

  /**
   * Récupère tous les objets du jeu
   */
  async getAllItems() {
    const data = await this.fetchDataDragon<{ data: Record<string, any> }>(
      `data/fr_FR/item.json`
    )
    return data.data
  }

  private static readonly DDRAGON_BASE = 'https://ddragon.leagueoflegends.com'

  private async fetchDataDragon<T>(path: string): Promise<T> {
    const version = await this.getLatestVersion()
    const url = `${RiotApiService.DDRAGON_BASE}/cdn/${version}/${path}`
    try {
      return (await fetch(url).then((r) => r.json())) as T
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      logger.warn({ url, err: reason }, 'Data Dragon unreachable')
      throw RiotApiError.unreachable(reason)
    }
  }
}
