/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('cosmetics', (table) => {
      table.string('id', 50).primary()
      table.string('name', 100).notNullable()
      table.string('type', 30).notNullable()
      table.string('asset_url', 500).notNullable()
      table.integer('price_honey').notNullable()
      table.timestamp('created_at', { useTz: true }).defaultTo(this.now())
    })

    this.schema.createTable('user_cosmetics', (table) => {
      table.increments('id').primary()
      table.string('user_puuid', 128).notNullable()
      table.string('cosmetic_id', 50).notNullable()
      table.boolean('equipped').notNullable().defaultTo(false)
      table.timestamp('purchased_at', { useTz: true }).defaultTo(this.now())
      table.unique(['user_puuid', 'cosmetic_id'])
    })
  }

  async down() {
    this.schema.dropTable('user_cosmetics')
    this.schema.dropTable('cosmetics')
  }
}
