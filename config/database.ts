/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const databaseUrl = env.get('DATABASE_URL')

function buildConnection() {
  if (databaseUrl) {
    // pg's URL parser does NOT auto-enable SSL from sslmode=require.
    // We honour it explicitly so Neon / Supabase / RDS work out of the box.
    const sslmode = new URL(databaseUrl).searchParams.get('sslmode')
    const ssl = sslmode && sslmode !== 'disable' ? { rejectUnauthorized: false } : false
    return { connectionString: databaseUrl, ssl }
  }

  return {
    host: env.get('DB_HOST'),
    port: env.get('DB_PORT'),
    user: env.get('DB_USER'),
    password: env.get('DB_PASSWORD', ''),
    database: env.get('DB_DATABASE'),
    ssl: env.get('DB_SSL', false) ? { rejectUnauthorized: false } : false,
  }
}

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      connection: buildConnection(),
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig
