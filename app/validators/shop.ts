/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const purchaseValidator = vine.compile(
  vine.object({
    cosmeticId: vine.string().trim().minLength(1).maxLength(50),
  })
)
