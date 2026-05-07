/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'riot_link_challenges'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('puuid', 100).notNullable()
      table.string('game_name', 32).notNullable()
      table.string('tag_line', 8).notNullable()
      table.string('region', 8).notNullable()
      table.integer('expected_icon_id').notNullable()
      table.integer('previous_icon_id').nullable()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.now())
      table.index(['user_id', 'expires_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
