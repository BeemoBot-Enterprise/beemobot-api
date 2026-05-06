/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { defineConfig } from '@adonisjs/cors'
import env from '#start/env'

const allowedOrigins = env
  .get('ALLOWED_ORIGINS')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

/**
 * Configuration options to tweak the CORS policy. The following
 * options are documented on the official documentation website.
 *
 * https://docs.adonisjs.com/guides/security/cors
 */
const corsConfig = defineConfig({
  enabled: true,
  origin: allowedOrigins,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  headers: true,
  exposeHeaders: [],
  credentials: true,
  maxAge: 90,
})

export default corsConfig
