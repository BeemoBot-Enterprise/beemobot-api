/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const spendValidator = vine.compile(
  vine.object({
    amount: vine.number().positive().max(100000),
    reason: vine.enum(['minigame_bet', 'cosmetic_purchase']),
    metadata: vine.object({}).allowUnknownProperties().optional(),
  })
)

export const creditValidator = vine.compile(
  vine.object({
    userPuuid: vine.string().trim().minLength(40).maxLength(128),
    amount: vine.number().positive().max(100000),
    reason: vine.enum(['minigame_win']),
    metadata: vine.object({}).allowUnknownProperties().optional(),
  })
)
