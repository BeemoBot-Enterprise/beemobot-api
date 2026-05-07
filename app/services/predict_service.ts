/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

export interface RankInput {
  tier: string
  division: string
  hotStreak: boolean
  masteryPoints: number
}

const TIER_VALUE: Record<string, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5,
  DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
}
const DIV_VALUE: Record<string, number> = { IV: 0, III: 1, II: 2, I: 3 }
const UNRANKED_DEFAULT = 8 // Silver IV equivalent

export default class PredictService {
  static rankScore(rank: RankInput | null): number {
    if (!rank) return UNRANKED_DEFAULT
    const t = TIER_VALUE[rank.tier] ?? 2
    const d = DIV_VALUE[rank.division] ?? 0
    let score = t * 4 + d
    if (rank.hotStreak) score += 2
    if (rank.masteryPoints > 100_000) score += 1
    return score
  }

  static predictWinPct(myTeamAvg: number, oppTeamAvg: number): number {
    const diff = myTeamAvg - oppTeamAvg
    const adjusted = 50 + Math.max(-35, Math.min(35, diff * 2.5))
    return Math.round(adjusted)
  }

  static explain(diff: number): string {
    if (diff > 8) return 'Tu es nettement favorisé.'
    if (diff > 4) return 'Léger avantage de ton côté.'
    if (diff < -8) return 'Équipe adverse nettement plus forte.'
    if (diff < -4) return 'Léger désavantage.'
    return 'Match équilibré.'
  }
}
