/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import ReputationEvent from '#models/reputation_event'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import RepService from '#services/rep_service'

test.group('RepService.computeWeight', () => {
  test('weight is 1.0 for new user (no rep)', async ({ assert }) => {
    const w = await RepService.computeWeight('new-puuid')
    assert.equal(w, 1.0)
  })

  test('weight scales linearly to max 2.0 at net_rep=50', async ({ assert }) => {
    await ReputationEvent.create({
      type: 'respect',
      giverPuuid: 'other',
      receiverPuuid: 'p',
      matchId: 'EUW1_1',
      weight: 1.0,
    })
    const w = await RepService.computeWeight('p')
    assert.closeTo(w, 1.02, 0.01) // 1 respect = +0.02
  })

  test('weight does not go below 1.0 with negative net rep', async ({ assert }) => {
    await ReputationEvent.create({
      type: 'shroom',
      giverPuuid: 'other',
      receiverPuuid: 'p',
      matchId: 'EUW1_1',
      weight: 1.0,
    })
    const w = await RepService.computeWeight('p')
    assert.equal(w, 1.0)
  })
})

test.group('RepService.giveRep', (group) => {
  group.each.setup(async () => {
    await ReputationEvent.truncate(true)
    await HoneyLedgerEntry.truncate(true)
  })

  test('creates event + credits honey', async ({ assert }) => {
    const event = await RepService.giveRep({
      giverPuuid: 'g1',
      receiverPuuid: 'r1',
      matchId: 'EUW1_1',
      type: 'respect',
      guildId: '12345',
    })
    assert.exists(event.id)
    assert.equal(event.weight, 1.0)
    const honey = await HoneyLedgerEntry.findBy('userPuuid', 'r1')
    assert.equal(honey?.delta, 10)
  })

  test('throws on duplicate (same giver, receiver, match, type)', async ({ assert }) => {
    await RepService.giveRep({
      giverPuuid: 'g1',
      receiverPuuid: 'r1',
      matchId: 'EUW1_1',
      type: 'respect',
    })
    await assert.rejects(() =>
      RepService.giveRep({
        giverPuuid: 'g1',
        receiverPuuid: 'r1',
        matchId: 'EUW1_1',
        type: 'respect',
      })
    )
  })
})
