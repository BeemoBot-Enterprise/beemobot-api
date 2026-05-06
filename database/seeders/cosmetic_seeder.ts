/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import Cosmetic from '#models/cosmetic'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

const STARTERS = [
  { id: 'badge_iron', name: 'Iron Badge', type: 'badge', assetUrl: '/cosmetics/badge_iron.png', priceHoney: 100 },
  { id: 'badge_bronze', name: 'Bronze Badge', type: 'badge', assetUrl: '/cosmetics/badge_bronze.png', priceHoney: 200 },
  { id: 'badge_gold', name: 'Gold Badge', type: 'badge', assetUrl: '/cosmetics/badge_gold.png', priceHoney: 500 },
  { id: 'badge_diamond', name: 'Diamond Badge', type: 'badge', assetUrl: '/cosmetics/badge_diamond.png', priceHoney: 1500 },
  { id: 'border_blue', name: 'Hextech Blue Border', type: 'border', assetUrl: '/cosmetics/border_blue.png', priceHoney: 300 },
  { id: 'border_gold', name: 'Hextech Gold Border', type: 'border', assetUrl: '/cosmetics/border_gold.png', priceHoney: 800 },
  { id: 'glow_purple', name: 'Purple Glow', type: 'glow', assetUrl: '/cosmetics/glow_purple.png', priceHoney: 250 },
  { id: 'glow_red', name: 'Red Glow (toxic)', type: 'glow', assetUrl: '/cosmetics/glow_red.png', priceHoney: 250 },
  { id: 'badge_teemo', name: 'Teemo Badge', type: 'badge', assetUrl: '/cosmetics/badge_teemo.png', priceHoney: 1000 },
  { id: 'border_pentakill', name: 'Pentakill Border', type: 'border', assetUrl: '/cosmetics/border_pentakill.png', priceHoney: 2000 },
]

export default class CosmeticSeeder extends BaseSeeder {
  async run() {
    await Cosmetic.updateOrCreateMany('id', STARTERS)
  }
}
