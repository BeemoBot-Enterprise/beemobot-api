/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import env from '#start/env'

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
    const response = await fetch(url, {
      headers: {
        'X-Riot-Token': this.apiKey,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Riot API Error (${response.status}): ${error}`)
    }

    return response.json()
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
   * Récupère les informations d'un joueur par son nom d'invocateur
   * Note: Cette méthode est dépréciée pour certaines régions, utilisez getAccountByRiotId à la place
   */
  async getSummonerByName(summonerName: string) {
    const url = `${this.baseUrl}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`
    return this.makeRequest<{
      id: string
      accountId: string
      puuid: string
      name: string
      profileIconId: number
      revisionDate: number
      summonerLevel: number
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
    // Utilise Data Dragon pour récupérer les infos des champions
    const version = await this.getLatestVersion()
    const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion.json`
    const data = await fetch(url).then((r) => r.json())

    // Trouve le champion par son ID
    for (const [key, champion] of Object.entries(data.data) as any) {
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
    const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion.json`
    const data = await fetch(url).then((r) => r.json())
    return data.data
  }

  /**
   * Récupère les détails complets d'un champion
   */
  async getChampionDetails(championName: string) {
    const version = await this.getLatestVersion()
    const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/champion/${championName}.json`
    const data = await fetch(url).then((r) => r.json())
    return data.data[championName]
  }

  /**
   * Récupère la dernière version de Data Dragon
   */
  async getLatestVersion(): Promise<string> {
    const url = 'https://ddragon.leagueoflegends.com/api/versions.json'
    const versions = await fetch(url).then((r) => r.json())
    return versions[0]
  }

  /**
   * Récupère l'URL de l'icône d'un champion
   */
  async getChampionIcon(championName: string): Promise<string> {
    const version = await this.getLatestVersion()
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${championName}.png`
  }

  /**
   * Récupère l'URL du splash art d'un champion
   */
  getChampionSplash(championName: string, skinNum: number = 0): string {
    return `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${championName}_${skinNum}.jpg`
  }

  /**
   * Récupère l'URL de l'icône d'un objet
   */
  async getItemIcon(itemId: number): Promise<string> {
    const version = await this.getLatestVersion()
    return `https://ddragon.leagueoflegends.com/cdn/${version}/img/item/${itemId}.png`
  }

  /**
   * Récupère tous les objets du jeu
   */
  async getAllItems() {
    const version = await this.getLatestVersion()
    const url = `https://ddragon.leagueoflegends.com/cdn/${version}/data/fr_FR/item.json`
    const data = await fetch(url).then((r) => r.json())
    return data.data
  }

  /**
   * Récupère les builds recommandés pour un champion (fictif, à adapter selon vos besoins)
   */
  async getChampionBuilds(championName: string) {
    // Ceci est un placeholder
    // Dans une vraie implémentation, vous utiliseriez une API tierce comme:
    // - U.GG API
    // - OP.GG API
    // - Ou votre propre base de données de builds
    return {
      champion: championName,
      builds: [
        {
          name: 'Build classique',
          role: 'TOP',
          items: [],
          runes: [],
          spells: [],
        },
      ],
    }
  }
}
