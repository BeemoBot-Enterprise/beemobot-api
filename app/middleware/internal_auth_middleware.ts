/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * Guards server-to-server worker endpoints (`/worker/*`) by requiring the
 * caller to present a shared secret in the `X-Internal-Key` header that
 * matches `INTERNAL_API_KEY`. Fast-fails with 401 otherwise.
 */
export default class InternalAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const provided = ctx.request.header('x-internal-key')
    const expected = env.get('INTERNAL_API_KEY')
    if (!provided || provided !== expected) {
      return ctx.response.status(401).json({ error: 'unauthorized' })
    }
    return next()
  }
}
