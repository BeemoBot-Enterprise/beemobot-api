/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.alterTable('reputation_events', (table) => {
      table.index(['giver_puuid', 'receiver_puuid'], 'idx_rep_giver_receiver')
    })
    this.schema.alterTable('honey_ledger', (table) => {
      table.index(['user_puuid'], 'idx_honey_user')
    })
  }

  async down() {
    this.schema.alterTable('reputation_events', (t) => t.dropIndex([], 'idx_rep_giver_receiver'))
    this.schema.alterTable('honey_ledger', (t) => t.dropIndex([], 'idx_honey_user'))
  }
}
