/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import vine from '@vinejs/vine'

export const linkRiotValidator = vine.compile(
  vine.object({
    gameName: vine.string().trim().minLength(1).maxLength(32),
    tagLine: vine.string().trim().minLength(1).maxLength(8),
    region: vine.enum([
      'euw1',
      'eun1',
      'na1',
      'br1',
      'jp1',
      'kr',
      'la1',
      'la2',
      'oc1',
      'tr1',
      'ru',
    ]),
  })
)
