/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'honey_ledger'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('user_puuid', 128).notNullable()
      table.integer('delta').notNullable()
      table.string('reason', 50).notNullable()
      table.jsonb('metadata').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.index(['user_puuid', 'created_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}