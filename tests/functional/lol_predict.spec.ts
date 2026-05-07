/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'

test.group('GET /lol/predict/by-discord/:id', (group) => {
  // @ts-expect-error: makeRequest is private but we need it for monkey-patching in tests
  const originalMakeRequest = RiotApiService.prototype.makeRequest

  group.each.setup(async () => {
    await User.truncate(true)
  })

  group.each.teardown(() => {
    // @ts-expect-error: restore original (private) method after each test
    RiotApiService.prototype.makeRequest = originalMakeRequest
  })

  test('returns 404 not_linked when user has no riot_puuid', async ({ client, assert }) => {
    await User.create({ discordId: 'D1', username: 'u' })
    const response = await client.get('/lol/predict/by-discord/D1')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 not_in_game when Spectator returns 404', async ({ client, assert }) => {
    await User.create({
      discordId: 'D2', username: 'u',
      riotPuuid: 'PUUID_LINKED', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    const { RiotApiError } = await import('#services/riot_api_service')
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) throw new RiotApiError(404, '')
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/predict/by-discord/D2')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_in_game')
  })

  test('returns 200 with team scores and winPct', async ({ client, assert }) => {
    await User.create({
      discordId: 'D3', username: 'u',
      riotPuuid: 'P_SELF', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) {
        return {
          gameId: 1, gameStartTime: 0, gameLength: 60,
          gameMode: 'CLASSIC', gameType: 'MATCHED_GAME',
          gameQueueConfigId: 420, mapId: 11,
          participants: [
            { puuid: 'P_SELF', championId: 222, teamId: 100, summonerId: 'S1', spell1Id: 4, spell2Id: 7, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
            { puuid: 'P_A', championId: 8, teamId: 200, summonerId: 'S2', spell1Id: 4, spell2Id: 12, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
          ],
          bannedChampions: [],
        }
      }
      if (url.includes('/lol/league/v4/entries/by-puuid/P_SELF')) {
        return [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'IV', leaguePoints: 0, wins: 0, losses: 0, hotStreak: false }]
      }
      if (url.includes('/lol/league/v4/entries/by-puuid/P_A')) {
        return [{ queueType: 'RANKED_SOLO_5x5', tier: 'DIAMOND', rank: 'II', leaguePoints: 0, wins: 0, losses: 0, hotStreak: false }]
      }
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/predict/by-discord/D3')
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.self.teamId, 100)
    assert.equal(body.teamScores['100'], 12) // Gold IV
    assert.equal(body.teamScores['200'], 26) // Diamond II
    assert.equal(body.diff, -14)
    assert.equal(body.winPct, 15) // clamp to 15
    assert.match(body.explanation, /nettement plus forte/i)
  })
})
