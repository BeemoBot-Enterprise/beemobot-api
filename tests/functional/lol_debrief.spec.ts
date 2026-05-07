/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'

const FIXTURE_PARTICIPANT = {
  puuid: 'PUUID_LINKED',
  championName: 'Jinx',
  teamPosition: 'BOTTOM',
  win: true,
  kills: 8, deaths: 3, assists: 12,
  totalMinionsKilled: 220, neutralMinionsKilled: 5,
  goldEarned: 14000, visionScore: 32,
  totalDamageDealtToChampions: 28000,
  challenges: { killParticipation: 0.74 },
}

test.group('GET /lol/debrief/by-discord/:id', (group) => {
  // @ts-expect-error accessing private method for test teardown
  const originalMakeRequest = RiotApiService.prototype.makeRequest

  group.each.setup(async () => {
    await User.truncate(true)
  })

  group.each.teardown(() => {
    // Restore the original makeRequest so prototype patches don't leak.
    // @ts-expect-error restoring private method after monkey-patch
    RiotApiService.prototype.makeRequest = originalMakeRequest
  })

  test('returns 404 not_linked when no user found', async ({ client, assert }) => {
    const response = await client.get('/lol/debrief/by-discord/UNKNOWN_DISCORD_ID')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 not_linked when user has no riot_puuid', async ({ client, assert }) => {
    await User.create({ discordId: 'D1', username: 'u' })
    const response = await client.get('/lol/debrief/by-discord/D1')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 no_recent_match when match history is empty', async ({ client, assert }) => {
    await User.create({
      discordId: 'D2', username: 'u',
      riotPuuid: 'PUUID_LINKED', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch private method
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/match/v5/matches/by-puuid')) return []
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/debrief/by-discord/D2')
    response.assertStatus(404)
    assert.equal(response.body().error, 'no_recent_match')
  })

  test('returns 200 with stats and verdicts on a real match', async ({ client, assert }) => {
    await User.create({
      discordId: 'D3', username: 'u',
      riotPuuid: 'PUUID_LINKED', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch private method
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/match/v5/matches/by-puuid')) return ['EUW1_M42']
      if (url.includes('/lol/match/v5/matches/EUW1_M42')) {
        return {
          info: {
            gameDuration: 25 * 60,
            queueId: 420,
            participants: [FIXTURE_PARTICIPANT],
          },
        }
      }
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/debrief/by-discord/D3')
    response.assertStatus(200)
    assert.equal(response.body().matchId, 'EUW1_M42')
    assert.equal(response.body().championName, 'Jinx')
    assert.equal(response.body().win, true)
    assert.exists(response.body().stats)
    assert.isArray(response.body().verdicts)
  })
})
