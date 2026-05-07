/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import RiotApiService, { RiotPlatform } from '#services/riot_api_service'
import PredictService, { RiotTier, RiotDivision } from '#services/predict_service'
import { mapQueueId } from '#services/riot_queue_types'

export interface ScoutParticipant {
  puuid: string
  championId: number
  championName: string
  teamId: 100 | 200
  summonerSpells: [number, number]
  rank: {
    tier: string
    rank: string
    leaguePoints: number
    wins: number
    losses: number
    hotStreak: boolean
  } | null
  championMastery: { level: number; points: number } | null
  championStats: { games: number; wins: number; winPct: number }
}

export interface ScoutResult {
  gameId: string
  gameStartTime: number
  gameLength: number
  queueType: string
  mapId: number
  self: { puuid: string; championName: string; teamId: number }
  teams: { '100': ScoutParticipant[]; '200': ScoutParticipant[] }
  topThreats: Array<{ puuid: string; championName: string; reason: string }>
  predictionWinPct: number
}

interface MatchLite {
  info: { participants: Array<{ puuid: string; championId: number; win: boolean }> }
}

export default class LiveScoutService {
  static aggregateChampionWinrate(
    matches: MatchLite[],
    puuid: string,
    championId: number
  ): { games: number; wins: number; winPct: number } {
    let games = 0
    let wins = 0
    for (const m of matches) {
      const p = m.info.participants.find((x) => x.puuid === puuid && x.championId === championId)
      if (!p) continue
      games++
      if (p.win) wins++
    }
    return { games, wins, winPct: games > 0 ? Math.round((wins / games) * 100) : 0 }
  }

  static pickThreats(
    opponents: ScoutParticipant[],
    n: number
  ): Array<{ puuid: string; championName: string; reason: string }> {
    const scored = opponents.map((p) => {
      const rankScore = PredictService.rankScore(
        p.rank
          ? { tier: p.rank.tier as RiotTier, division: p.rank.rank as RiotDivision, hotStreak: p.rank.hotStreak, masteryPoints: p.championMastery?.points ?? 0 }
          : null
      )
      const wrBonus = p.championStats.games >= 5 && p.championStats.winPct >= 60 ? 3 : 0
      return { p, score: rankScore + wrBonus }
    })
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(({ p }) => ({
        puuid: p.puuid,
        championName: p.championName,
        reason: buildReason(p),
      }))
  }

  static async enrich(
    riot: RiotApiService,
    activeGame: any,
    selfPuuid: string,
    championNameById: Record<number, string>,
    platform: RiotPlatform = 'europe'
  ): Promise<ScoutResult> {
    const enrichedParticipants: ScoutParticipant[] = await Promise.all(
      activeGame.participants.map(async (p: any) => {
        const [rankEntries, masteries, matchIds] = await Promise.all([
          riot.getSummonerRank(p.puuid).catch(() => []),
          riot.getTopChampionMasteries(p.puuid, 5).catch(() => []),
          riot.getMatchHistory(p.puuid, platform, 0, 10).catch(() => []),
        ])
        const matches = await Promise.all(
          matchIds.slice(0, 10).map((id: string) => riot.getMatchDetails(id, platform).catch(() => null))
        )
        const validMatches = matches.filter((m): m is MatchLite => m !== null)
        const championStats = LiveScoutService.aggregateChampionWinrate(validMatches, p.puuid, p.championId)

        const solo = rankEntries.find((e: any) => e.queueType === 'RANKED_SOLO_5x5') ?? rankEntries[0] ?? null
        const championMastery = masteries.find((m: any) => m.championId === p.championId) ?? null

        return {
          puuid: p.puuid,
          championId: p.championId,
          championName: championNameById[p.championId] ?? `Champion${p.championId}`,
          teamId: p.teamId,
          summonerSpells: [p.spell1Id, p.spell2Id] as [number, number],
          rank: solo,
          championMastery: championMastery ? { level: championMastery.championLevel, points: championMastery.championPoints } : null,
          championStats,
        }
      })
    )

    const teams = { '100': [] as ScoutParticipant[], '200': [] as ScoutParticipant[] }
    for (const p of enrichedParticipants) teams[String(p.teamId) as '100' | '200'].push(p)

    const selfP = enrichedParticipants.find((p) => p.puuid === selfPuuid)
    const selfTeamId = selfP?.teamId ?? 100
    const opponents = enrichedParticipants.filter((p) => p.teamId !== selfTeamId)
    const topThreats = LiveScoutService.pickThreats(opponents, 1)

    const myAvg = avg(teams[String(selfTeamId) as '100' | '200'].map((p) => scoreOf(p)))
    const oppAvg = avg(teams[selfTeamId === 100 ? '200' : '100'].map((p) => scoreOf(p)))

    return {
      gameId: String(activeGame.gameId),
      gameStartTime: activeGame.gameStartTime,
      gameLength: activeGame.gameLength,
      queueType: mapQueueId(activeGame.gameQueueConfigId),
      mapId: activeGame.mapId,
      self: {
        puuid: selfPuuid,
        championName: selfP?.championName ?? 'Unknown',
        teamId: selfTeamId,
      },
      teams,
      topThreats,
      predictionWinPct: PredictService.predictWinPct(myAvg, oppAvg),
    }
  }
}

function scoreOf(p: ScoutParticipant): number {
  return PredictService.rankScore(
    p.rank
      ? { tier: p.rank.tier as RiotTier, division: p.rank.rank as RiotDivision, hotStreak: p.rank.hotStreak, masteryPoints: p.championMastery?.points ?? 0 }
      : null
  )
}

function avg(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function buildReason(p: ScoutParticipant): string {
  const parts: string[] = []
  if (p.rank) parts.push(`${capital(p.rank.tier)} ${p.rank.rank}`)
  if (p.championMastery) parts.push(`${Math.round(p.championMastery.points / 1000)}k mastery`)
  if (p.championStats.games >= 5) parts.push(`${p.championStats.winPct}% WR sur ${p.championName}`)
  return parts.join(' · ')
}

function capital(s: string): string {
  return s[0] + s.slice(1).toLowerCase()
}
