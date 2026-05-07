/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type DmQueueStatus = 'pending' | 'sent' | 'failed'

export interface DmParticipant {
  puuid: string
  championName: string
  kills: number
  deaths: number
  assists: number
  win: boolean
  teamId: number
}

export default class DmQueueEntry extends BaseModel {
  static table = 'dm_queue'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare discordId: string

  @column()
  declare matchId: string

  @column()
  declare participants: DmParticipant[]

  @column()
  declare status: DmQueueStatus

  @column()
  declare attempts: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime()
  declare sentAt: DateTime | null

  @column()
  declare lastError: string | null
}
