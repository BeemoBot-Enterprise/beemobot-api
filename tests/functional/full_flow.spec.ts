/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import User from '#models/user'
import HoneyLedgerEntry from '#models/honey_ledger_entry'
import ReputationEvent from '#models/reputation_event'

test.group('e2e: rep flow', (group) => {
  group.each.setup(async () => {
    await ReputationEvent.truncate(true)
    await HoneyLedgerEntry.truncate(true)
    await User.truncate(true)
  })

  test('full flow: linked giver gives respect, balance reflects credit', async ({ client, assert }) => {
    const giverPuuid = 'g'.repeat(78)
    const receiverPuuid = 'r'.repeat(78)
    await User.create({
      discordId: 'd1',
      email: 'a@b.fr',
      username: 'tester1',
      riotPuuid: giverPuuid,
      linkedAt: DateTime.now(),
    })

    const giveRes = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid,
      matchId: 'EUW1_E2E',
      type: 'respect',
    })
    giveRes.assertStatus(201)

    const profileRes = await client.get(`/profile/${receiverPuuid}`)
    profileRes.assertStatus(200)
    const profile = profileRes.body()
    assert.equal(profile.counts.respects, 1)
    assert.equal(profile.honey, 10)
  })

  test('shroom + respect on same match work as 2 separate events', async ({ client, assert }) => {
    const giverPuuid = 'g'.repeat(78)
    const receiverPuuid = 'r'.repeat(78)
    await User.create({
      discordId: 'd1',
      email: 'a@b.fr',
      username: 'tester1',
      riotPuuid: giverPuuid,
      linkedAt: DateTime.now(),
    })

    const r1 = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid,
      matchId: 'EUW1_DUAL',
      type: 'respect',
    })
    r1.assertStatus(201)
    const r2 = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid,
      matchId: 'EUW1_DUAL',
      type: 'shroom',
    })
    r2.assertStatus(201)

    const profileRes = await client.get(`/profile/${receiverPuuid}`)
    const profile = profileRes.body()
    assert.equal(profile.counts.respects, 1)
    assert.equal(profile.counts.shrooms, 1)
    assert.equal(profile.honey, 15) // 10 + 5
  })

  test('duplicate respect on same match returns 409', async ({ client }) => {
    const giverPuuid = 'g'.repeat(78)
    const receiverPuuid = 'r'.repeat(78)
    await User.create({
      discordId: 'd1',
      email: 'a@b.fr',
      username: 'tester1',
      riotPuuid: giverPuuid,
      linkedAt: DateTime.now(),
    })
    await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid,
      matchId: 'EUW1_DUP',
      type: 'respect',
    })
    const dup = await client.post('/rep/give').json({
      giverDiscordId: 'd1',
      receiverPuuid,
      matchId: 'EUW1_DUP',
      type: 'respect',
    })
    dup.assertStatus(409)
  })
})
