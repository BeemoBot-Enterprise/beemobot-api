import { HttpContext } from '@adonisjs/core/http'

export default class ResponseService {
  static default(data: any, message = 'Operation successful', ctx: HttpContext) {
    return {
      metadata: {
        ip: ctx.request.ip(),
        timestamp: new Date().toISOString(),
        user_id: ctx.auth.user?.id,
      },
      message,
      data,
    }
  }
}
