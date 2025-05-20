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

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Routes d'authentification
router.get('/auth/discord/redirect', [AuthController, 'redirectToDiscord'])
router.get('/auth/discord/callback', [AuthController, 'discordCallback'])
router.get('/auth/', [AuthController, 'discordCallback'])

// Routes pour le bot Discord (sans authentification)
router.post('/game/shroom', [GameController, 'giveShroom'])
router.post('/game/respect', [GameController, 'giveRespect'])
router.get('/game/stats/:username', [GameController, 'getUserStats'])
router.get('/game/top/shrooms', [GameController, 'getTopShrooms'])
router.get('/game/top/respects', [GameController, 'getTopRespects'])
