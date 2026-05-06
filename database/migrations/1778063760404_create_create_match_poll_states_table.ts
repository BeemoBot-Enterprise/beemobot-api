/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'match_poll_state'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('user_puuid', 128).primary()
      table.string('last_polled_match_id', 64).nullable()
      table.timestamp('last_polled_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}