/**
 * Copyright (c) 2024-2026 BeemoBot Enterprise
 * All rights reserved.
 */

/**
 * Convert a Riot queueId (number) to a stable string label for display/logging.
 * Source: https://static.developer.riotgames.com/docs/lol/queues.json
 */
export function mapQueueId(queueId: number): string {
  const map: Record<number, string> = {
    420: 'RANKED_SOLO_5x5',
    440: 'RANKED_FLEX_SR',
    400: 'NORMAL_DRAFT',
    430: 'NORMAL_BLIND',
    450: 'ARAM',
    700: 'CLASH',
  }
  return map[queueId] ?? `QUEUE_${queueId}`
}
