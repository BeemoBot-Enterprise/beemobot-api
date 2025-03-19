import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { UserFactory } from '#database/factories/index'

export default class UserSeeder extends BaseSeeder {
  async run() {
    const userData = {
      email: 'john.doe@beemobpt-entreprise.fr',
      username: 'John Doe',
    }

    await UserFactory.createMany(100)

    try {
      await User.create(userData)
      console.log('Utilisateur créé avec succès :', userData.email)
    } catch (error) {
      console.error("Erreur lors de la création de l'utilisateur :", error)
    }
  }
}
