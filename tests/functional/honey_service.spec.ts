/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import HoneyService from '#services/honey_service'

test.group('HoneyService', (group) => {
  group.each.setup(async () => {
    await HoneyLedgerEntry.truncate(true)
  })

  test('credit appends a positive entry', async ({ assert }) => {
    await HoneyService.credit('puuid-1', 10, 'respect_received', { match_id: 'EUW1_1' })
    const entries = await HoneyLedgerEntry.query().where('userPuuid', 'puuid-1')
    assert.lengthOf(entries, 1)
    assert.equal(entries[0].delta, 10)
  })

  test('balance sums all deltas', async ({ assert }) => {
    await HoneyService.credit('puuid-1', 10, 'respect_received')
    await HoneyService.credit('puuid-1', 5, 'shroom_received')
    await HoneyService.debit('puuid-1', 3, 'minigame_bet')
    const balance = await HoneyService.balance('puuid-1')
    assert.equal(balance, 12)
  })

  test('debit fails on insufficient balance', async ({ assert }) => {
    await HoneyService.credit('puuid-1', 5, 'respect_received')
    await assert.rejects(() => HoneyService.debit('puuid-1', 10, 'minigame_bet'))
  })
})
