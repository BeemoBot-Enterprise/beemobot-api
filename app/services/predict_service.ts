/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

export type RiotTier =
  | 'IRON' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'EMERALD'
  | 'DIAMOND' | 'MASTER' | 'GRANDMASTER' | 'CHALLENGER'

export type RiotDivision = 'I' | 'II' | 'III' | 'IV'

export interface RankInput {
  tier: RiotTier
  division: RiotDivision
  hotStreak: boolean
  masteryPoints: number
}

const TIER_VALUE: Record<RiotTier, number> = {
  IRON: 0, BRONZE: 1, SILVER: 2, GOLD: 3, PLATINUM: 4, EMERALD: 5,
  DIAMOND: 6, MASTER: 7, GRANDMASTER: 8, CHALLENGER: 9,
}
const DIV_VALUE: Record<RiotDivision, number> = { IV: 0, III: 1, II: 2, I: 3 }
const UNRANKED_DEFAULT = 8 // Silver IV equivalent

const PREDICT_CONFIG = {
  // 4 divisions (IV, III, II, I) per tier — base score = tier_value * 4 + div_value
  DIVISIONS_PER_TIER: 4,
  // Multiplier applied to (myAvg - oppAvg) before adding to 50.
  // Higher = more sensitive to small rank differences.
  WIN_PCT_SENSITIVITY: 2.5,
  // Maximum swing from 50% in either direction (clamps the win% to [15, 85]).
  WIN_PCT_MAX_SWING: 35,
  // Mastery points threshold to grant the +1 "expert" rank-score bonus.
  MASTERY_BONUS_THRESHOLD: 100_000,
  // Bonus added to rank score when the player is on a hot streak (League v4 flag).
  HOT_STREAK_BONUS: 2,
} as const

export default class PredictService {
  static rankScore(rank: RankInput | null): number {
    if (!rank) return UNRANKED_DEFAULT
    const t = TIER_VALUE[rank.tier]
    const d = DIV_VALUE[rank.division]
    let score = t * PREDICT_CONFIG.DIVISIONS_PER_TIER + d
    if (rank.hotStreak) score += PREDICT_CONFIG.HOT_STREAK_BONUS
    if (rank.masteryPoints > PREDICT_CONFIG.MASTERY_BONUS_THRESHOLD) score += 1
    return score
  }

  /**
   * Predicts the win probability for a team given the average rank scores of both sides.
   * @returns Win probability as an integer percentage in [15, 85] (clamped).
   */
  static predictWinPct(myTeamAvg: number, oppTeamAvg: number): number {
    const diff = myTeamAvg - oppTeamAvg
    const swing = diff * PREDICT_CONFIG.WIN_PCT_SENSITIVITY
    const clamped = Math.max(-PREDICT_CONFIG.WIN_PCT_MAX_SWING,
                             Math.min(PREDICT_CONFIG.WIN_PCT_MAX_SWING, swing))
    return Math.round(50 + clamped)
  }

  static explain(diff: number): string {
    if (diff > 8) return 'Tu es nettement favorisé.'
    if (diff > 4) return 'Léger avantage de ton côté.'
    if (diff < -8) return 'Équipe adverse nettement plus forte.'
    if (diff < -4) return 'Léger désavantage.'
    return 'Match équilibré.'
  }
}
