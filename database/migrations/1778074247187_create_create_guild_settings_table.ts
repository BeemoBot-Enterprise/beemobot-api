/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'guild_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.string('guild_id', 32).primary()
      table.boolean('rep_enabled').notNullable().defaultTo(true)
      table.string('public_channel_id', 32).nullable()
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
