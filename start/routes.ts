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

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router
  .group(() => {
    router.get('users', async ({ auth }) => {
      return { user: auth.user }
    })
  })
  .use(
    middleware.auth({
      guards: ['api'],
    })
  )

router.get('/auth/discord/redirect', [AuthController, 'redirectToDiscord'])
router.get('/auth/discord/callback', [AuthController, 'discordCallback'])
router.get('/auth/', [AuthController, 'discordCallback'])

router.get('/example', (ctx) => {
  console.log(ctx.inspect())
  return {
    ip: ctx.request.serialize(),
    method: ctx.request.method(),
    url: ctx.request.url(),
  }
})
