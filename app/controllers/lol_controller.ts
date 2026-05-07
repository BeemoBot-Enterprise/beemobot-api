/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import RiotApiService, {
  RiotRegion,
  RiotPlatform,
  RiotApiError,
} from '#services/riot_api_service'
import User from '#models/user'
import DebriefService from '#services/debrief_service'
import { mapQueueId } from '#services/riot_queue_types'
import PredictService, { RiotTier, RiotDivision } from '#services/predict_service'

function sanitizeError(error: unknown): { status: number; message: string } {
  if (error instanceof RiotApiError) {
    const status = error.statusCode === 404 ? 404 : error.statusCode >= 500 ? 502 : 400
    return { status, message: error.publicMessage }
  }
  return { status: 500, message: 'Internal server error' }
}

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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'summoner_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'rank_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'masteries_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'profile_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'matches_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'match_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'champions_fetch_failed', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'champion_not_found', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'items_fetch_failed', message })
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
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'version_fetch_failed', message })
    }
  }

  /**
   * GET /lol/debrief/by-discord/:id
   * Analyse le dernier match d'un joueur lié via son Discord ID
   */
  async debriefByDiscord({ params, response }: HttpContext) {
    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      return response.status(404).json({ error: 'not_linked' })
    }

    // TODO: use user.riotRegion when a region column is added to the User model.
    const riot = new RiotApiService('euw1')

    let matchIds: string[]
    let match: any
    try {
      matchIds = await riot.getMatchHistory(user.riotPuuid, 'europe', 0, 1)
      if (matchIds.length === 0) {
        return response.status(404).json({ error: 'no_recent_match' })
      }
      match = await riot.getMatchDetails(matchIds[0], 'europe')
    } catch (error) {
      const { status, message } = sanitizeError(error)
      return response.status(status).json({ error: 'riot_api_error', message })
    }

    const participant = match.info.participants.find((p: any) => p.puuid === user.riotPuuid)
    if (!participant) {
      return response.status(404).json({ error: 'no_recent_match' })
    }
    const queueType = mapQueueId(match.info.queueId)
    const result = DebriefService.analyze(participant, matchIds[0], match.info.gameDuration, queueType)
    return response.json(result)
  }

  /**
   * GET /lol/predict/by-discord/:id
   * Prédit l'issue de la partie en cours d'un joueur lié via son Discord ID
   */
  async predictByDiscord({ params, response }: HttpContext) {
    const user = await User.findBy('discordId', params.id)
    if (!user || !user.riotPuuid) {
      return response.status(404).json({ error: 'not_linked' })
    }
    // TODO: use user.riotRegion when a region column is added to the User model.
    const riot = new RiotApiService('euw1')
    let active
    try {
      active = await riot.getActiveGameByPuuid(user.riotPuuid)
    } catch (err) {
      if (err instanceof RiotApiError && err.statusCode === 404) {
        return response.status(404).json({ error: 'not_in_game' })
      }
      throw err
    }

    const ranks = await Promise.all(
      active.participants.map(async (p) => {
        try {
          const entries = await riot.getSummonerRank(p.puuid)
          const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5') ?? entries[0] ?? null
          return { puuid: p.puuid, teamId: p.teamId, rank: solo }
        } catch {
          return { puuid: p.puuid, teamId: p.teamId, rank: null }
        }
      })
    )

    const scoresByTeam: Record<number, number[]> = { 100: [], 200: [] }
    for (const r of ranks) {
      const s = PredictService.rankScore(
        r.rank
          ? {
              tier: r.rank.tier as RiotTier,
              division: r.rank.rank as RiotDivision,
              hotStreak: r.rank.hotStreak,
              // Spectator v5 doesn't expose mastery points; we treat them as 0 here.
              masteryPoints: 0,
            }
          : null
      )
      scoresByTeam[r.teamId].push(s)
    }

    const avg100 = scoresByTeam[100].length
      ? Math.round((scoresByTeam[100].reduce((a, b) => a + b, 0) / scoresByTeam[100].length) * 10) / 10
      : 0
    const avg200 = scoresByTeam[200].length
      ? Math.round((scoresByTeam[200].reduce((a, b) => a + b, 0) / scoresByTeam[200].length) * 10) / 10
      : 0

    const selfParticipant = active.participants.find((p) => p.puuid === user.riotPuuid)
    if (!selfParticipant) {
      return response.status(500).json({
        error: 'self_not_in_game',
        message: 'User puuid not found in active game participants. Possible Riot data inconsistency.',
      })
    }
    const selfTeam = selfParticipant.teamId
    const myAvg = selfTeam === 100 ? avg100 : avg200
    const oppAvg = selfTeam === 100 ? avg200 : avg100
    const diff = Math.round((myAvg - oppAvg) * 10) / 10

    return response.json({
      gameId: String(active.gameId),
      self: { teamId: selfTeam },
      teamScores: { '100': avg100, '200': avg200 },
      diff,
      winPct: PredictService.predictWinPct(myAvg, oppAvg),
      explanation: PredictService.explain(diff),
    })
  }
}
