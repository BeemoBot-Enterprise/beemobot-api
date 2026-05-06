/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import HoneyService from '#services/honey_service'

export default class DailyHoneyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const user = ctx.auth?.user
    if (user?.riotPuuid && user.linkedAt) {
      try {
        await HoneyService.tryDaily(user)
      } catch {
        // never block the request on daily honey failure
      }
    }
    return next()
  }
}
