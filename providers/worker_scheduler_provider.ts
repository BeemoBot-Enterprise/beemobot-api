/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import type { ApplicationService } from '@adonisjs/core/types'

/**
 * Boots a periodic in-process scheduler that runs the Riot poller.
 *
 * Activated only when ENABLE_WORKER=true so it does not run in CI/test or
 * when the API is deployed in a context that doesn't own the worker (e.g.
 * a future read-only replica).
 *
 * The scheduler runs every WORKER_INTERVAL_S seconds (default 300s), guards
 * against overlapping ticks via a simple in-flight flag, and skips its first
 * tick by WORKER_INTERVAL_S so boot stays fast.
 */
export default class WorkerSchedulerProvider {
  private timer: NodeJS.Timeout | null = null
  private running = false

  constructor(protected app: ApplicationService) {}

  async boot() {}

  async start() {
    if (this.app.getEnvironment() !== 'web') return

    const env = await import('#start/env')
    if (!env.default.get('ENABLE_WORKER', false)) return

    const intervalMs = Number(env.default.get('WORKER_INTERVAL_S', 300)) * 1000
    const logger = (await import('@adonisjs/core/services/logger')).default

    const tick = async () => {
      if (this.running) {
        logger.warn('worker tick skipped: previous run still in flight')
        return
      }
      this.running = true
      try {
        const { default: RiotPollerService } = await import('#services/riot_poller_service')
        await new RiotPollerService().pollAll()
      } catch (err) {
        logger.error({ err }, 'worker tick crashed')
      } finally {
        this.running = false
      }
    }

    this.timer = setInterval(tick, intervalMs)
    logger.info({ intervalMs }, 'worker scheduler started')
  }

  async shutdown() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
