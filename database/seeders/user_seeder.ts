/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { UserFactory } from '#database/factories/index'
import logger from '@adonisjs/core/services/logger'

export default class UserSeeder extends BaseSeeder {
  async run() {
    const userData = {
      email: 'john.doe@beemobot-enterprise.fr',
      username: 'John Doe',
    }

    await UserFactory.createMany(100)

    try {
      await User.create(userData)
      logger.info({ email: userData.email }, 'Demo user created')
    } catch (error) {
      logger.error({ err: error }, 'Failed to create demo user')
    }
  }
}
