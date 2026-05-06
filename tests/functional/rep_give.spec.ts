/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import ReputationEvent from '#models/reputation_event'
import HoneyLedgerEntry from '#models/honey_ledger_entry'

test.group('POST /rep/give', (group) => {
  group.each.setup(async () => {
    await ReputationEvent.truncate(true)
    await HoneyLedgerEntry.truncate(true)
    await User.truncate(true)
  })

  test('rejects unlinked giver', async ({ client }) => {
    await User.create({
      discordId: 'd1',
      username: 'tester1',
      email: 'a@b.fr',
    })
    const response = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid: 'a'.repeat(78),
      matchId: 'EUW1_1',
      type: 'respect',
    })
    response.assertStatus(403)
  })

  test('returns 422 on invalid payload', async ({ client }) => {
    const response = await client.post('/rep/give').json({})
    response.assertStatus(422)
  })

  test('creates event and credits honey for linked giver', async ({ client, assert }) => {
    await User.create({
      discordId: 'd1',
      username: 'tester1',
      email: 'a@b.fr',
      riotPuuid: 'g'.repeat(78),
      linkedAt: DateTime.now(),
    })
    const response = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid: 'r'.repeat(78),
      matchId: 'EUW1_1',
      type: 'respect',
    })
    response.assertStatus(201)
    const honey = await HoneyLedgerEntry.findBy('userPuuid', 'r'.repeat(78))
    assert.equal(honey?.delta, 10)
  })
})
