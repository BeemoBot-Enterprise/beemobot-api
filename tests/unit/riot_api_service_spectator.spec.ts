/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { test } from '@japa/runner'
import RiotApiService, { RiotApiError } from '#services/riot_api_service'

test.group('RiotApiService.getActiveGameByPuuid', () => {
  test('builds the Spectator v5 URL using the puuid', async ({ assert }) => {
    const service = new RiotApiService('euw1')
    let calledUrl = ''
    // @ts-expect-error — accessing private for unit test
    service.makeRequest = async (url: string) => {
      calledUrl = url
      return { gameId: 1, gameStartTime: 0, gameLength: 0, gameMode: 'CLASSIC',
               gameType: 'MATCHED_GAME', gameQueueConfigId: 420, mapId: 11,
               participants: [], bannedChampions: [] }
    }
    await service.getActiveGameByPuuid('PUUID_X')
    assert.equal(
      calledUrl,
      'https://euw1.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/PUUID_X'
    )
  })

  test('propagates RiotApiError when Riot returns 404', async ({ assert }) => {
    const service = new RiotApiService('euw1')
    // @ts-expect-error — accessing private for unit test
    service.makeRequest = async () => {
      throw new RiotApiError(404, 'not found')
    }
    await assert.rejects(() => service.getActiveGameByPuuid('PUUID_X'), 'Not found')
  })
})
