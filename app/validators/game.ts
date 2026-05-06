/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const giveRewardValidator = vine.compile(
  vine.object({
    username: vine.string().trim().minLength(1).maxLength(64),
    reason: vine.string().trim().maxLength(500).optional(),
  })
)
