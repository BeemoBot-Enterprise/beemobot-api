/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.dropTableIfExists('shrooms')
    this.schema.dropTableIfExists('respects')
    this.schema.dropTableIfExists('reports')
    this.schema.dropTableIfExists('champions')
  }

  async down() {
    // Pas de rollback : on ne reconstruit pas les tables legacy.
  }
}