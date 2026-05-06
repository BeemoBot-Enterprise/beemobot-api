/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

interface Entry<T> {
  value: T
  expiresAt: number
}

const STORE = new Map<string, Entry<unknown>>()

export default class Cache {
  static async memo<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const hit = STORE.get(key)
    if (hit && hit.expiresAt > now) return hit.value as T
    const value = await loader()
    STORE.set(key, { value, expiresAt: now + ttlSeconds * 1000 })
    return value
  }

  static invalidate(key: string) {
    STORE.delete(key)
  }
}
