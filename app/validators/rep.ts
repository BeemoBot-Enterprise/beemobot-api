/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const giveRepValidator = vine.compile(
  vine.object({
    giverDiscordId: vine.string().trim().minLength(1).maxLength(32),
    receiverPuuid: vine.string().trim().minLength(40).maxLength(128),
    matchId: vine.string().trim().minLength(5).maxLength(64),
    type: vine.enum(['shroom', 'respect']),
    guildId: vine.string().trim().minLength(1).maxLength(32).optional(),
    reason: vine.string().trim().maxLength(200).optional(),
  })
)

export const eligibleQueryValidator = vine.compile(
  vine.object({
    giverPuuid: vine.string().trim().minLength(40).maxLength(128),
    receiverPuuid: vine.string().trim().minLength(40).maxLength(128),
    region: vine
      .enum(['europe', 'americas', 'asia', 'sea'])
      .optional(),
  })
)
