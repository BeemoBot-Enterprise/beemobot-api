/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import UserRepository from '../repositories/user_repository.js'
import { UserDataType } from '../types/user_type.js'

export default class UserService {
  private userRepository: UserRepository

  constructor(userRepository: UserRepository) {
    this.userRepository = userRepository
  }

  public async registerOrLoginUser(data: UserDataType) {
    const existingUser = await this.userRepository.findByEmail(data.email)
    if (existingUser) {
      return existingUser
    }
    return this.userRepository.create(data)
  }

  public async updateUser(id: number, data: Partial<UserDataType>) {
    if (data.email) {
      throw new Error('Email cannot be updated')
    }
    return this.userRepository.update(id, data)
  }
}
