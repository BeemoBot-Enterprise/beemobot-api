/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  // Either DATABASE_URL OR the discrete DB_* vars must be set.
  // DATABASE_URL wins when both are provided (Neon, Supabase, etc.).
  DATABASE_URL: Env.schema.string.optional(),
  DB_HOST: Env.schema.string.optional({ format: 'host' }),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string.optional(),
  DB_SSL: Env.schema.boolean.optional(),

  /*
  |----------------------------------------------------------
  | Variables for configuring ally package
  |----------------------------------------------------------
  */
  DISCORD_CLIENT_ID: Env.schema.string(),
  DISCORD_CLIENT_SECRET: Env.schema.string(),
  DISCORD_CALLBACK_URL: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for configuring Riot API
  |----------------------------------------------------------
  */
  RIOT_API_KEY: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Web app target (post-OAuth redirect) and CORS whitelist
  |----------------------------------------------------------
  */
  WEBAPP_URL: Env.schema.string(),
  ALLOWED_ORIGINS: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Internal service-to-service shared secret
  |----------------------------------------------------------
  */
  INTERNAL_API_KEY: Env.schema.string(),
})
