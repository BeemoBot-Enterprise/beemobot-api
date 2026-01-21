/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import env from '#start/env'
import { defineConfig, services } from '@adonisjs/ally'

const allyConfig = defineConfig({
  discord: services.discord({
    clientId: env.get('DISCORD_CLIENT_ID')!,
    clientSecret: env.get('DISCORD_CLIENT_SECRET')!,
    callbackUrl: env.get('DISCORD_CALLBACK_URL')!,
  }),
  // Riot OAuth désactivé pour le moment
  // riot: () => ({
  //   driver: 'RiotOauth2',
  //   clientId: env.get('RIOT_CLIENT_ID')!,
  //   clientSecret: env.get('RIOT_CLIENT_SECRET')!,
  //   callbackUrl: env.get('RIOT_CALLBACK_URL')!,
  //   scopes: ['openid'],
  // }),
})

export default allyConfig

declare module '@adonisjs/ally/types' {
  interface SocialProviders extends InferSocialProviders<typeof allyConfig> {}
}
