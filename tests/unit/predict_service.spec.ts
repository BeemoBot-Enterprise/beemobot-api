/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import PredictService from '#services/predict_service'

const D2_RANK = { tier: 'DIAMOND', division: 'II', hotStreak: false, masteryPoints: 0 }
const G4_RANK = { tier: 'GOLD', division: 'IV', hotStreak: false, masteryPoints: 0 }
const UNRANKED = null

test.group('PredictService.rankScore', () => {
  test('Diamond II = 26', ({ assert }) => {
    assert.equal(PredictService.rankScore(D2_RANK), 26)
  })
  test('Gold IV = 12', ({ assert }) => {
    assert.equal(PredictService.rankScore(G4_RANK), 12)
  })
  test('unranked defaults to 8 (Silver IV equivalent)', ({ assert }) => {
    assert.equal(PredictService.rankScore(UNRANKED), 8)
  })
  test('hot streak adds 2', ({ assert }) => {
    assert.equal(PredictService.rankScore({ ...D2_RANK, hotStreak: true }), 28)
  })
  test('mastery > 100k adds 1', ({ assert }) => {
    assert.equal(PredictService.rankScore({ ...D2_RANK, masteryPoints: 150_000 }), 27)
  })
})

test.group('PredictService.predictWinPct', () => {
  test('equal teams => 50%', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(20, 20), 50)
  })
  test('+6 score advantage => 65%', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(26, 20), 65)
  })
  test('-10 score => 25%', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(20, 30), 25)
  })
  test('clamps to [15, 85]', ({ assert }) => {
    assert.equal(PredictService.predictWinPct(50, 0), 85)
    assert.equal(PredictService.predictWinPct(0, 50), 15)
  })
})

test.group('PredictService.explain', () => {
  test('returns "match équilibré" for small diff', ({ assert }) => {
    assert.match(PredictService.explain(2), /équilibré/i)
  })
  test('returns advantage message for diff > 4', ({ assert }) => {
    assert.match(PredictService.explain(6), /avantage/i)
  })
  test('returns disadvantage for diff < -4', ({ assert }) => {
    assert.match(PredictService.explain(-6), /désavantage/i)
  })
})
