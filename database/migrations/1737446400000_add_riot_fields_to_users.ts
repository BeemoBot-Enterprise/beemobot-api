/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('riot_puuid').unique().nullable()
      table.string('riot_game_name').nullable()
      table.string('riot_tag_line').nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('riot_puuid')
      table.dropColumn('riot_game_name')
      table.dropColumn('riot_tag_line')
    })
  }
}
