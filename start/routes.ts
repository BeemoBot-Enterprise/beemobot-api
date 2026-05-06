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
import { middleware } from '#start/kernel'

const AuthController = () => import('#controllers/auth_controller')
const GameController = () => import('#controllers/game_controller')
const LolController = () => import('#controllers/lol_controller')
const RepController = () => import('#controllers/rep_controller')
const ProfileController = () => import('#controllers/profile_controller')
const EconomyController = () => import('#controllers/economy_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Routes d'authentification Discord
router.get('/auth/discord/redirect', [AuthController, 'redirectToDiscord'])
router.get('/auth/discord/callback', [AuthController, 'discordCallback'])
router.get('/auth/', [AuthController, 'discordCallback'])

// Routes authentifiées (token requis)
router.post('/auth/link', [AuthController, 'linkRiot']).use(middleware.auth())

// Routes pour le bot Discord (sans authentification)
router.post('/game/shroom', [GameController, 'giveShroom'])
router.post('/game/respect', [GameController, 'giveRespect'])
router.get('/game/stats/:username', [GameController, 'getUserStats'])
router.get('/game/top/shrooms', [GameController, 'getTopShrooms'])
router.get('/game/top/respects', [GameController, 'getTopRespects'])

// Routes rep-system (bot uses Discord ID lookup, no auth middleware)
router.get('/rep/eligible', [RepController, 'eligible'])
router.post('/rep/give', [RepController, 'give'])

// Routes profil public
router.get('/profile/:puuid', [ProfileController, 'show'])

// Routes économie (authentification requise)
router.get('/economy/balance', [EconomyController, 'balance']).use(middleware.auth())

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
