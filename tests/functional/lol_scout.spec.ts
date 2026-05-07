/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import User from '#models/user'
import RiotApiService from '#services/riot_api_service'
import { DateTime } from 'luxon'

test.group('GET /lol/scout/by-discord/:id', (group) => {
  // @ts-expect-error: accessing private method to save/restore in teardown
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
    const response = await client.get('/lol/scout/by-discord/D1')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_linked')
  })

  test('returns 404 not_in_game when Spectator returns 404', async ({ client, assert }) => {
    await User.create({
      discordId: 'D2', username: 'u',
      riotPuuid: 'P_S', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    const { RiotApiError } = await import('#services/riot_api_service')
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) throw new RiotApiError(404, '')
      // For DataDragon (champion list), return empty so the controller doesn't crash if it pre-fetches.
      if (url.includes('versions.json')) return ['14.1.1']
      if (url.includes('/cdn/') && url.includes('champion.json')) return { data: {} }
      return { data: {} }
    }
    const response = await client.get('/lol/scout/by-discord/D2')
    response.assertStatus(404)
    assert.equal(response.body().error, 'not_in_game')
  })

  test('returns 200 with enriched participants', async ({ client, assert }) => {
    await User.create({
      discordId: 'D3', username: 'u',
      riotPuuid: 'P_S', riotGameName: 'Nunch', riotTagLine: 'N7789',
      linkedAt: DateTime.now(),
    })
    // @ts-expect-error monkey-patch
    RiotApiService.prototype.makeRequest = async (url: string) => {
      if (url.includes('/lol/spectator/v5/active-games')) {
        return {
          gameId: 1, gameStartTime: 1715000000000, gameLength: 180,
          gameMode: 'CLASSIC', gameType: 'MATCHED_GAME',
          gameQueueConfigId: 420, mapId: 11,
          participants: [
            { puuid: 'P_S', championId: 222, teamId: 100, summonerId: 'S1', spell1Id: 4, spell2Id: 7, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
            { puuid: 'P_O', championId: 8,   teamId: 200, summonerId: 'S2', spell1Id: 4, spell2Id: 12, perks: { perkIds: [], perkStyle: 0, perkSubStyle: 0 } },
          ],
          bannedChampions: [],
        }
      }
      if (url.includes('/lol/league/v4')) return [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', rank: 'II', leaguePoints: 0, wins: 10, losses: 5, hotStreak: false }]
      if (url.includes('/lol/champion-mastery/v4')) return []
      if (url.includes('/lol/match/v5/matches/by-puuid')) return []
      if (url.includes('versions.json')) return ['14.1.1']
      if (url.includes('/cdn/') && url.includes('champion.json')) {
        return { data: {
          Jinx: { key: '222', name: 'Jinx', id: 'Jinx' },
          Vladimir: { key: '8', name: 'Vladimir', id: 'Vladimir' },
        }}
      }
      throw new Error('unexpected URL: ' + url)
    }
    const response = await client.get('/lol/scout/by-discord/D3')
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.self.championName, 'Jinx')
    assert.equal(body.self.teamId, 100)
    assert.lengthOf(body.teams['100'], 1)
    assert.lengthOf(body.teams['200'], 1)
    assert.exists(body.predictionWinPct)
  })
})
