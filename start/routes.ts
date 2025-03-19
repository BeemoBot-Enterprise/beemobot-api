/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.get('/example', (ctx) => {
  console.log(ctx.inspect())
  return {
    ip: ctx.request.serialize(),
    method: ctx.request.method(),
    url: ctx.request.url(),
  }
})
