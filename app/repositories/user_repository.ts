import User from '#models/user'
import { UserDataType } from '../types/user_type.js'

export default class UserRepository {
  public async findById(id: number) {
    return User.findOrFail(id)
  }

  public async findByEmail(email: string) {
    return User.findBy('email', email)
  }

  public async findByDiscordId(id: string) {
    return User.findBy('discord_id', id)
  }

  public async create(data: UserDataType) {
    return User.create(data)
  }

  public async update(id: number, data: Partial<UserDataType>) {
    const user = await User.findOrFail(id)
    user.merge(data)
    await user.save()
    return user
  }
}
