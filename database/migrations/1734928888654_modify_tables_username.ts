import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'shrooms'

  async up() {
    // Modifier la table shrooms
    this.schema.alterTable('shrooms', (table) => {
      table.dropColumn('affected_user_id')
      table.string('username').notNullable()
    })

    // Modifier la table respects
    this.schema.alterTable('respects', (table) => {
      table.dropColumn('affected_user_id')
      table.string('username').notNullable()
    })
  }

  async down() {
    // Restaurer la table shrooms
    this.schema.alterTable('shrooms', (table) => {
      table.dropColumn('username')
      table.integer('affected_user_id').unsigned().notNullable()
    })

    // Restaurer la table respects
    this.schema.alterTable('respects', (table) => {
      table.dropColumn('username')
      table.integer('affected_user_id').unsigned().notNullable()
    })
  }
}
