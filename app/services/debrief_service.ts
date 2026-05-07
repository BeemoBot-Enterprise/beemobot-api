/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

export type Severity = 'red' | 'yellow' | 'green'

export interface DebriefVerdict {
  severity: Severity
  msg: string
}

export interface DebriefStats {
  kda: number
  csPerMin: number
  goldPerMin: number
  visionPerMin: number
  damageRatio: number
  killParticipation: number
}

export interface DebriefResult {
  matchId: string
  championName: string
  queueType: string
  win: boolean
  durationMin: number
  stats: DebriefStats
  verdicts: DebriefVerdict[]
  score: string
}

interface ParticipantInput {
  championName: string
  teamPosition: string
  win: boolean
  kills: number
  deaths: number
  assists: number
  totalMinionsKilled: number
  neutralMinionsKilled: number
  goldEarned: number
  visionScore: number
  totalDamageDealtToChampions: number
  challenges?: { killParticipation?: number }
}

interface ScoredVerdict extends DebriefVerdict {
  weight: number
  delta: number
}

const SEVERITY_VALUE: Record<Severity, number> = { red: 0, yellow: 5, green: 10 }
const SEVERITY_RANK: Record<Severity, number> = { red: 3, yellow: 2, green: 1 }

export default class DebriefService {
  static analyze(
    p: ParticipantInput,
    matchId: string,
    durationSec: number,
    queueType: string
  ): DebriefResult {
    const stats = computeStats(p, durationSec)
    const all = applyHeuristics(stats, p)
    const top = pickTop(all, 3)
    const score = computeScore(all)
    return {
      matchId,
      championName: p.championName,
      queueType,
      win: p.win,
      durationMin: Math.round(durationSec / 60),
      stats,
      verdicts: top.map(({ severity, msg }) => ({ severity, msg })),
      score,
    }
  }
}

function computeStats(p: ParticipantInput, durationSec: number): DebriefStats {
  const minutes = Math.max(durationSec / 60, 1)
  const cs = p.totalMinionsKilled + p.neutralMinionsKilled
  return {
    kda: round2((p.kills + p.assists) / Math.max(p.deaths, 1)),
    csPerMin: round2(cs / minutes),
    goldPerMin: Math.round(p.goldEarned / minutes),
    visionPerMin: round2(p.visionScore / minutes),
    damageRatio: round2(p.totalDamageDealtToChampions / Math.max(p.goldEarned, 1)),
    killParticipation: round2(p.challenges?.killParticipation ?? 0),
  }
}

function applyHeuristics(s: DebriefStats, p: ParticipantInput): ScoredVerdict[] {
  const out: ScoredVerdict[] = []
  const isLane = ['TOP', 'MIDDLE', 'BOTTOM', 'UTILITY'].includes(p.teamPosition)
  const isJungle = p.teamPosition === 'JUNGLE'
  const isCarry = p.teamPosition === 'BOTTOM' || p.teamPosition === 'MIDDLE'

  if (s.kda < 1.0) {
    out.push({ severity: 'red', weight: 2, delta: 1.0 - s.kda,
      msg: `Tu es mort plus que tu as contribué (KDA ${s.kda}) — focus survie` })
  }
  if (s.kda > 4.0 && p.win) {
    out.push({ severity: 'green', weight: 2, delta: s.kda - 4.0,
      msg: `Carry-game propre (KDA ${s.kda}) 👏` })
  }
  if (isLane && s.csPerMin < 5) {
    out.push({ severity: 'yellow', weight: 1, delta: 5 - s.csPerMin,
      msg: `Farm en dessous du standard (${s.csPerMin}/min) — pratique le CS en custom` })
  }
  if (isJungle && s.csPerMin < 4) {
    out.push({ severity: 'yellow', weight: 1, delta: 4 - s.csPerMin,
      msg: `Farm jungle bas (${s.csPerMin}/min) — clean tes camps plus vite` })
  }
  if (isLane && s.csPerMin > 8) {
    out.push({ severity: 'green', weight: 1, delta: s.csPerMin - 8,
      msg: `Excellent farm (${s.csPerMin}/min)` })
  }
  if (s.visionPerMin < 1) {
    out.push({ severity: 'yellow', weight: 1, delta: 1 - s.visionPerMin,
      msg: `Vision insuffisante (${s.visionPerMin}/min — vise 1+)` })
  }
  if (s.damageRatio > 2.5) {
    out.push({ severity: 'green', weight: 1, delta: s.damageRatio - 2.5,
      msg: `Excellent dmg/gold (${s.damageRatio}) — or bien valorisé` })
  }
  if (isCarry && s.damageRatio < 1.0) {
    out.push({ severity: 'yellow', weight: 1, delta: 1.0 - s.damageRatio,
      msg: `Peu de dégâts pour ton rôle (dmg/gold ${s.damageRatio})` })
  }
  if (s.killParticipation > 0.7 && p.win) {
    out.push({ severity: 'green', weight: 1, delta: s.killParticipation - 0.7,
      msg: `Très impliqué dans les fights (${Math.round(s.killParticipation * 100)}%)` })
  }
  if (s.killParticipation < 0.3) {
    out.push({ severity: 'yellow', weight: 1, delta: 0.3 - s.killParticipation,
      msg: `Peu impliqué dans les fights — colle ton équipe en mid-game` })
  }
  return out
}

function pickTop(verdicts: ScoredVerdict[], n: number): ScoredVerdict[] {
  return [...verdicts]
    .sort((a, b) => {
      const r = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
      if (r !== 0) return r
      return b.delta - a.delta
    })
    .slice(0, n)
}

function computeScore(all: ScoredVerdict[]): string {
  if (all.length === 0) return 'B'
  const totalWeight = all.reduce((s, v) => s + v.weight, 0)
  const weighted = all.reduce((s, v) => s + SEVERITY_VALUE[v.severity] * v.weight, 0)
  const avg = weighted / totalWeight  // 0..10
  // Map 0..10 to letter grades
  if (avg >= 9) return 'A+'
  if (avg >= 8) return 'A'
  if (avg >= 7) return 'B+'
  if (avg >= 6) return 'B'
  if (avg >= 5) return 'C+'
  if (avg >= 4) return 'C'
  if (avg >= 2) return 'D'
  return 'F'
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
