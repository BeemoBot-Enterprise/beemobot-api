/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

const AuthController = () => import('#controllers/auth_controller')
const GameController = () => import('#controllers/game_controller')
const LolController = () => import('#controllers/lol_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Routes d'authentification Discord
router.get('/auth/discord/redirect', [AuthController, 'redirectToDiscord'])
router.get('/auth/discord/callback', [AuthController, 'discordCallback'])
router.get('/auth/', [AuthController, 'discordCallback'])

// Routes Riot OAuth (désactivées pour le moment)
// router.get('/auth/riot/redirect', [AuthController, 'redirectToRiot'])
// router.get('/auth/riot/callback', [AuthController, 'riotCallback'])

// Routes pour le bot Discord (sans authentification)
router.post('/game/shroom', [GameController, 'giveShroom'])
router.post('/game/respect', [GameController, 'giveRespect'])
router.get('/game/stats/:username', [GameController, 'getUserStats'])
router.get('/game/top/shrooms', [GameController, 'getTopShrooms'])
router.get('/game/top/respects', [GameController, 'getTopRespects'])

// Routes League of Legends (Riot API)
router.get('/lol/version', [LolController, 'getVersion'])
router.get('/lol/champions', [LolController, 'getAllChampions'])
router.get('/lol/champion/:championName', [LolController, 'getChampionDetails'])
router.get('/lol/items', [LolController, 'getAllItems'])
router.get('/lol/summoner/:summonerName', [LolController, 'getSummoner'])
router.get('/lol/summoner/:summonerName/profile', [LolController, 'getCompleteProfile'])
router.get('/lol/summoner/:summonerName/rank', [LolController, 'getSummonerRank'])
router.get('/lol/summoner/:summonerName/masteries', [LolController, 'getChampionMasteries'])
router.get('/lol/summoner/:summonerName/matches', [LolController, 'getMatchHistory'])
router.get('/lol/match/:matchId', [LolController, 'getMatchDetails'])
