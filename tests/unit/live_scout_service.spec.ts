/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import LiveScoutService from '#services/live_scout_service'

test.group('LiveScoutService.aggregateChampionWinrate', () => {
  test('returns games=0 when no matches', ({ assert }) => {
    const stats = LiveScoutService.aggregateChampionWinrate([], 'P_X', 222)
    assert.deepEqual(stats, { games: 0, wins: 0, winPct: 0 })
  })

  test('counts only matches where the puuid played the champion', ({ assert }) => {
    const matches = [
      { info: { participants: [
        { puuid: 'P_X', championId: 222, win: true },
      ]}},
      { info: { participants: [
        { puuid: 'P_X', championId: 11, win: false },  // different champion, ignored
      ]}},
      { info: { participants: [
        { puuid: 'P_X', championId: 222, win: false },
      ]}},
    ]
    const stats = LiveScoutService.aggregateChampionWinrate(matches as any, 'P_X', 222)
    assert.equal(stats.games, 2)
    assert.equal(stats.wins, 1)
    assert.equal(stats.winPct, 50)
  })

  test('rounds winPct to integer', ({ assert }) => {
    const matches = Array.from({ length: 7 }, (_, i) => ({
      info: { participants: [{ puuid: 'P_X', championId: 222, win: i < 5 }] },
    }))
    const stats = LiveScoutService.aggregateChampionWinrate(matches as any, 'P_X', 222)
    assert.equal(stats.games, 7)
    assert.equal(stats.wins, 5)
    assert.equal(stats.winPct, 71) // 5/7 = 71.4
  })
})

test.group('LiveScoutService.pickThreats', () => {
  test('picks the top adversary by combined rank+mastery score', ({ assert }) => {
    const opps = [
      { puuid: 'P_A', championName: 'Vladimir', rank: { tier: 'DIAMOND', rank: 'II' }, championMastery: { points: 350_000 }, championStats: { winPct: 60 } },
      { puuid: 'P_B', championName: 'Ornn',     rank: { tier: 'GOLD',    rank: 'IV' }, championMastery: { points: 12_000 },  championStats: { winPct: 45 } },
      { puuid: 'P_C', championName: 'Caitlyn',  rank: null,                            championMastery: { points: 0 },        championStats: { winPct: 30 } },
    ]
    const threats = LiveScoutService.pickThreats(opps as any, 1)
    assert.lengthOf(threats, 1)
    assert.equal(threats[0].championName, 'Vladimir')
    assert.match(threats[0].reason, /Diamond II/)
  })
})
