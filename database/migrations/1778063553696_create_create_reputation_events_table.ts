/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'reputation_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.bigIncrements('id').primary()
      table.string('type', 10).notNullable()
      table.string('giver_puuid', 128).notNullable()
      table.string('receiver_puuid', 128).notNullable()
      table.string('guild_id', 32).nullable()
      table.string('match_id', 64).notNullable()
      table.decimal('weight', 3, 2).notNullable().defaultTo(1.0)
      table.text('reason').nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['giver_puuid', 'receiver_puuid', 'match_id', 'type'])
      table.index(['receiver_puuid', 'type'])
      table.index(['guild_id', 'created_at'])
      table.index('created_at')
    })

    this.schema.raw(
      `ALTER TABLE reputation_events ADD CONSTRAINT type_valid CHECK (type IN ('shroom','respect'))`
    )
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}