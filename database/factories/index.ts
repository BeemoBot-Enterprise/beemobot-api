/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import User from '#models/user'
import Factory from '@adonisjs/lucid/factories'

export const UserFactory = Factory.define(User, ({ faker }) => {
  return {
    discord_id: faker.internet.ip(),
    username: faker.internet.username(),
    email: faker.internet.email(),
  }
}).build()
