import User from '#models/user'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class UserSeeder extends BaseSeeder {
  async run() {
    // Crée un utilisateur avec un mot de passe haché
    const userData = {
      fullName: 'John Doe',
      email: 'john.doe@beemobpt-entreprise.fr',
      password: 'passwordExample123', // Hachage du mot de passe
    }

    try {
      await User.create(userData)
      console.log('Utilisateur créé avec succès :', userData.email)
    } catch (error) {
      console.error("Erreur lors de la création de l'utilisateur :", error)
    }
  }
}
