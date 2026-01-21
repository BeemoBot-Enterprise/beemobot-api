/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import RiotApiService, { RiotRegion, RiotPlatform } from '#services/riot_api_service'

export default class LolController {
  /**
   * Helper pour extraire gameName et tagLine et récupérer le summoner
   */
  private async getSummonerByRiotId(
    summonerName: string,
    region: RiotRegion,
    tagLineParam?: string
  ) {
    const riotApi = new RiotApiService(region)

    let gameName = summonerName
    let tagLine = tagLineParam

    // Si le format est "GameName-TagLine", séparer
    if (gameName.includes('-') && !tagLine) {
      const parts = gameName.split('-')
      gameName = parts[0]
      tagLine = parts[1]
    }

    // Définir le tagLine par défaut selon la région
    if (!tagLine) {
      const defaultTags: Record<string, string> = {
        euw1: 'EUW',
        eun1: 'EUNE',
        na1: 'NA1',
        kr: 'KR1',
        br1: 'BR1',
        jp1: 'JP1',
        la1: 'LAN',
        la2: 'LAS',
        oc1: 'OCE',
        tr1: 'TR1',
        ru: 'RU',
      }
      tagLine = defaultTags[region] || 'EUW'
    }

    // Récupérer le compte via Riot ID
    const account = await riotApi.getAccountByRiotId(gameName, tagLine)

    // Récupérer les infos du summoner avec le PUUID
    const summoner = await riotApi.getSummonerByPuuid(account.puuid)

    return { account, summoner, riotApi }
  }
  /**
   * GET /lol/summoner/:summonerName
   * Récupère les informations d'un invocateur par son nom
   * Supporte le format "GameName-TagLine" ou "GameName" (tagLine par défaut selon région)
   */
  async getSummoner({ params, request, response }: HttpContext) {
    try {
      const region = request.input('region', 'euw1') as RiotRegion
      const tagLine = request.input('tagLine')

      const { account, summoner } = await this.getSummonerByRiotId(
        params.summonerName,
        region,
        tagLine
      )

      return response.json({
        ...summoner,
        gameName: account.gameName,
        tagLine: account.tagLine,
      })
    } catch (error) {
      return response.status(404).json({
        error: 'summoner_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/summoner/:summonerName/rank
   * Récupère le rang d'un invocateur
   */
  async getSummonerRank({ params, request, response }: HttpContext) {
    try {
      const region = request.input('region', 'euw1') as RiotRegion
      const tagLine = request.input('tagLine')

      const { account, summoner, riotApi } = await this.getSummonerByRiotId(
        params.summonerName,
        region,
        tagLine
      )

      const rank = await riotApi.getSummonerRank(summoner.puuid)

      return response.json({
        summoner: {
          name: summoner.name,
          gameName: account.gameName,
          tagLine: account.tagLine,
          level: summoner.summonerLevel,
        },
        ranks: rank,
      })
    } catch (error) {
      return response.status(404).json({
        error: 'rank_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/summoner/:summonerName/masteries
   * Récupère les masteries de champions d'un invocateur
   */
  async getChampionMasteries({ params, request, response }: HttpContext) {
    try {
      const region = request.input('region', 'euw1') as RiotRegion
      const tagLine = request.input('tagLine')
      const top = request.input('top', 10)

      const { account, summoner, riotApi } = await this.getSummonerByRiotId(
        params.summonerName,
        region,
        tagLine
      )

      const masteries = await riotApi.getTopChampionMasteries(summoner.puuid, top)

      // Enrichir avec les noms des champions
      const masteriesWithNames = await Promise.all(
        masteries.map(async (mastery) => {
          const champion = await riotApi.getChampionById(mastery.championId)
          return {
            ...mastery,
            championName: champion?.name || 'Unknown',
            championImage: champion ? await riotApi.getChampionIcon(champion.id) : null,
          }
        })
      )

      return response.json({
        summoner: {
          name: summoner.name,
          gameName: account.gameName,
          tagLine: account.tagLine,
          level: summoner.summonerLevel,
        },
        masteries: masteriesWithNames,
      })
    } catch (error) {
      return response.status(404).json({
        error: 'masteries_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/summoner/:summonerName/profile
   * Récupère le profil complet d'un joueur (infos, ranks, masteries, matchs détaillés)
   */
  async getCompleteProfile({ params, request, response }: HttpContext) {
    try {
      const region = request.input('region', 'euw1') as RiotRegion
      const tagLine = request.input('tagLine')
      const platform = request.input('platform', 'europe') as RiotPlatform
      const topChampions = request.input('topChampions', 5)
      const matchCount = request.input('matchCount', 10)

      const { account, summoner, riotApi } = await this.getSummonerByRiotId(
        params.summonerName,
        region,
        tagLine
      )

      // Récupérer toutes les données en parallèle
      const [ranks, masteries, matchIds] = await Promise.all([
        riotApi.getSummonerRank(summoner.puuid),
        riotApi.getTopChampionMasteries(summoner.puuid, topChampions),
        riotApi.getMatchHistory(summoner.puuid, platform, 0, matchCount),
      ])

      // Enrichir les masteries avec les noms des champions
      const masteriesWithNames = await Promise.all(
        masteries.map(async (mastery) => {
          const champion = await riotApi.getChampionById(mastery.championId)
          return {
            ...mastery,
            championName: champion?.name || 'Unknown',
            championImage: champion ? await riotApi.getChampionIcon(champion.id) : null,
          }
        })
      )

      // Récupérer les détails des derniers matchs
      const matchDetails = await Promise.all(
        matchIds.slice(0, Math.min(5, matchIds.length)).map(async (matchId) => {
          try {
            const match = await riotApi.getMatchDetails(matchId, platform)
            const participant = match.info.participants.find((p: any) => p.puuid === summoner.puuid)

            return {
              matchId,
              gameMode: match.info.gameMode,
              gameCreation: match.info.gameCreation,
              gameDuration: match.info.gameDuration,
              participant: participant
                ? {
                    championName: participant.championName,
                    championId: participant.championId,
                    kills: participant.kills,
                    deaths: participant.deaths,
                    assists: participant.assists,
                    totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
                    goldEarned: participant.goldEarned,
                    champLevel: participant.champLevel,
                    totalMinionsKilled: participant.totalMinionsKilled,
                    visionScore: participant.visionScore,
                    win: participant.win,
                    items: [
                      participant.item0,
                      participant.item1,
                      participant.item2,
                      participant.item3,
                      participant.item4,
                      participant.item5,
                      participant.item6,
                    ],
                    teamPosition: participant.teamPosition,
                  }
                : null,
            }
          } catch (error) {
            return null
          }
        })
      )

      return response.json({
        summoner: {
          puuid: summoner.puuid,
          name: summoner.name,
          gameName: account.gameName,
          tagLine: account.tagLine,
          profileIconId: summoner.profileIconId,
          summonerLevel: summoner.summonerLevel,
          revisionDate: summoner.revisionDate,
        },
        ranks: ranks.map((rank: any) => ({
          queueType: rank.queueType,
          tier: rank.tier,
          rank: rank.rank,
          leaguePoints: rank.leaguePoints,
          wins: rank.wins,
          losses: rank.losses,
          winRate: ((rank.wins / (rank.wins + rank.losses)) * 100).toFixed(1),
          hotStreak: rank.hotStreak,
          veteran: rank.veteran,
          freshBlood: rank.freshBlood,
        })),
        topChampions: masteriesWithNames.map((mastery) => ({
          championId: mastery.championId,
          championName: mastery.championName,
          championImage: mastery.championImage,
          championLevel: mastery.championLevel,
          championPoints: mastery.championPoints,
          chestGranted: mastery.chestGranted,
          lastPlayTime: mastery.lastPlayTime,
        })),
        recentMatches: matchDetails.filter((match) => match !== null),
        totalMatches: matchIds.length,
      })
    } catch (error) {
      return response.status(404).json({
        error: 'profile_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/summoner/:summonerName/matches
   * Récupère l'historique de matchs d'un invocateur
   */
  async getMatchHistory({ params, request, response }: HttpContext) {
    try {
      const region = request.input('region', 'euw1') as RiotRegion
      const tagLine = request.input('tagLine')
      const platform = request.input('platform', 'europe') as RiotPlatform
      const count = request.input('count', 10)

      const { account, summoner, riotApi } = await this.getSummonerByRiotId(
        params.summonerName,
        region,
        tagLine
      )

      const matchIds = await riotApi.getMatchHistory(summoner.puuid, platform, 0, count)

      return response.json({
        summoner: {
          name: summoner.name,
          gameName: account.gameName,
          tagLine: account.tagLine,
          puuid: summoner.puuid,
        },
        matchIds,
        count: matchIds.length,
      })
    } catch (error) {
      return response.status(404).json({
        error: 'matches_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/match/:matchId
   * Récupère les détails d'un match
   */
  async getMatchDetails({ params, request, response }: HttpContext) {
    try {
      const platform = request.input('platform', 'europe') as RiotPlatform
      const riotApi = new RiotApiService()

      const match = await riotApi.getMatchDetails(params.matchId, platform)

      return response.json(match)
    } catch (error) {
      return response.status(404).json({
        error: 'match_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/champions
   * Récupère la liste de tous les champions
   */
  async getAllChampions({ response }: HttpContext) {
    try {
      const riotApi = new RiotApiService()
      const champions = await riotApi.getAllChampions()

      return response.json({
        champions,
        count: Object.keys(champions).length,
      })
    } catch (error) {
      return response.status(500).json({
        error: 'champions_fetch_failed',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/champion/:championName
   * Récupère les détails d'un champion
   */
  async getChampionDetails({ params, response }: HttpContext) {
    try {
      const riotApi = new RiotApiService()
      const champion = await riotApi.getChampionDetails(params.championName)

      return response.json(champion)
    } catch (error) {
      return response.status(404).json({
        error: 'champion_not_found',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/items
   * Récupère la liste de tous les objets
   */
  async getAllItems({ response }: HttpContext) {
    try {
      const riotApi = new RiotApiService()
      const items = await riotApi.getAllItems()

      return response.json({
        items,
        count: Object.keys(items).length,
      })
    } catch (error) {
      return response.status(500).json({
        error: 'items_fetch_failed',
        message: error.message,
      })
    }
  }

  /**
   * GET /lol/version
   * Récupère la version actuelle de League of Legends
   */
  async getVersion({ response }: HttpContext) {
    try {
      const riotApi = new RiotApiService()
      const version = await riotApi.getLatestVersion()

      return response.json({
        version,
      })
    } catch (error) {
      return response.status(500).json({
        error: 'version_fetch_failed',
        message: error.message,
      })
    }
  }
}
