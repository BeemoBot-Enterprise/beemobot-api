/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import DebriefService from '#services/debrief_service'

const baseParticipant = {
  championName: 'Jinx',
  teamPosition: 'BOTTOM',
  win: false,
  kills: 5, deaths: 5, assists: 5,
  totalMinionsKilled: 180, neutralMinionsKilled: 0,
  goldEarned: 12000,
  visionScore: 25,
  totalDamageDealtToChampions: 22000,
  challenges: { killParticipation: 0.5 },
}
const DURATION_25_MIN = 25 * 60

test.group('DebriefService.analyze', () => {
  test('computes basic stats correctly', ({ assert }) => {
    const r = DebriefService.analyze(baseParticipant, 'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5')
    assert.equal(r.stats.kda, 2.0)
    assert.equal(r.stats.csPerMin, 7.2)
    assert.equal(r.stats.goldPerMin, 480)
    assert.equal(r.stats.visionPerMin, 1.0)
    assert.closeTo(r.stats.damageRatio, 1.83, 0.01)
    assert.equal(r.stats.killParticipation, 0.5)
  })

  test('KDA < 1.0 produces a red verdict', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 1, deaths: 10, assists: 4 },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    const reds = r.verdicts.filter(v => v.severity === 'red')
    assert.isAtLeast(reds.length, 1)
    assert.match(reds[0].msg, /survie/i)
  })

  test('KDA > 4 with win produces a green carry verdict', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 12, deaths: 2, assists: 8, win: true },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.isTrue(r.verdicts.some(v => v.severity === 'green' && /carry/i.test(v.msg)))
  })

  test('low CS/min on lane produces yellow farm verdict', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, totalMinionsKilled: 90, teamPosition: 'BOTTOM' },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.isTrue(r.verdicts.some(v => v.severity === 'yellow' && /farm/i.test(v.msg)))
  })

  test('caps verdicts at 3 with priority red > yellow > green', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 0, deaths: 12, assists: 1,
        totalMinionsKilled: 50, visionScore: 5,
        challenges: { killParticipation: 0.1 } },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.lengthOf(r.verdicts, 3)
    // First verdict must be the red (highest priority).
    assert.equal(r.verdicts[0].severity, 'red')
    // No green should appear when reds and yellows fill the 3 slots.
    assert.isFalse(r.verdicts.some(v => v.severity === 'green'))
  })

  test('green verdicts are squeezed out by yellows when both compete', ({ assert }) => {
    // KDA 7.5 + win → green carry; CS/min 4 (lane <5) → yellow; vision 0.32/min → yellow.
    // No red. Top 3 should put both yellows before the green.
    const r = DebriefService.analyze(
      { ...baseParticipant, kills: 10, deaths: 2, assists: 5, win: true,
        totalMinionsKilled: 100, visionScore: 8,
        challenges: { killParticipation: 0.45 } },
      'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.lengthOf(r.verdicts, 3)
    const severities = r.verdicts.map(v => v.severity)
    const lastYellowIdx = severities.lastIndexOf('yellow')
    const firstGreenIdx = severities.indexOf('green')
    if (firstGreenIdx >= 0 && lastYellowIdx >= 0) {
      assert.isAbove(firstGreenIdx, lastYellowIdx, 'yellows must appear before greens')
    }
  })

  test('score is a letter grade', ({ assert }) => {
    const r = DebriefService.analyze(baseParticipant, 'M_1', DURATION_25_MIN, 'RANKED_SOLO_5x5')
    assert.match(r.score, /^[ABCDF][+-]?$|^F$/)
  })

  test('returns matchId, championName, win, durationMin', ({ assert }) => {
    const r = DebriefService.analyze(
      { ...baseParticipant, win: true },
      'EUW1_42', DURATION_25_MIN, 'RANKED_SOLO_5x5'
    )
    assert.equal(r.matchId, 'EUW1_42')
    assert.equal(r.championName, 'Jinx')
    assert.equal(r.win, true)
    assert.equal(r.durationMin, 25)
    assert.equal(r.queueType, 'RANKED_SOLO_5x5')
  })
})
