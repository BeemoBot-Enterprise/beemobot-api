/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

import { HttpContext } from '@adonisjs/core/http'
import Shroom from '#models/shroom'
import Respect from '#models/respect'
import { giveRewardValidator } from '#validators/game'

export default class GameController {
  public async giveShroom({ request, response }: HttpContext) {
    const payload = await request.validateUsing(giveRewardValidator)

    const shroom = await Shroom.create({
      username: payload.username,
      reason: payload.reason ?? null,
    })

    return response.status(201).json({
      status: 'success',
      message: 'Shroom given',
      data: shroom,
    })
  }

  public async giveRespect({ request, response }: HttpContext) {
    const payload = await request.validateUsing(giveRewardValidator)

    const respect = await Respect.create({
      username: payload.username,
      reason: payload.reason ?? null,
    })

    return response.status(201).json({
      status: 'success',
      message: 'Respect given',
      data: respect,
    })
  }

  public async getUserStats({ params, response }: HttpContext) {
    const { username } = params

    const shroomsCount = await Shroom.query().where('username', username).count('* as total')

    const respectsCount = await Respect.query().where('username', username).count('* as total')

    return response.json({
      status: 'success',
      data: {
        username: username,
        shrooms: Number(shroomsCount[0].$extras.total),
        respects: Number(respectsCount[0].$extras.total),
      },
    })
  }

  public async getTopShrooms({ response }: HttpContext) {
    const topShrooms = await Shroom.query()
      .select('username')
      .count('* as total')
      .groupBy('username')
      .orderBy('total', 'desc')
      .limit(10)

    return response.json({
      status: 'success',
      data: topShrooms.map((user) => ({
        username: user.username,
        shrooms: Number(user.$extras.total),
      })),
    })
  }

  public async getTopRespects({ response }: HttpContext) {
    const topRespects = await Respect.query()
      .select('username')
      .count('* as total')
      .groupBy('username')
      .orderBy('total', 'desc')
      .limit(10)

    return response.json({
      status: 'success',
      data: topRespects.map((user) => ({
        username: user.username,
        respects: Number(user.$extras.total),
      })),
    })
  }
}
