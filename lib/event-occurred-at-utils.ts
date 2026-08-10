/** Boss/siege event occurred_at — KST 기준 TIMESTAMPTZ ISO 문자열 */

const KST_SUFFIX = "+09:00"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** YYYY-MM-DD + slot hour(0–23) → occurred_at */
export function bossEventOccurredAtIso(eventDate: string, slotHour: number): string {
  return `${eventDate}T${pad2(slotHour)}:00:00${KST_SUFFIX}`
}

/** YYYY-MM-DD + TIME/HH:mm → occurred_at */
export function siegeEventOccurredAtIso(eventDate: string, startTime: string): string {
  const timePart = startTime.slice(0, 5)
  return `${eventDate}T${timePart}:00${KST_SUFFIX}`
}

export function parseSlotIdToOccurredAtIso(slotId: string): string | null {
  const match = slotId.match(/^(\d{4}-\d{2}-\d{2})-(\d{1,2})$/)
  if (!match) return null
  return bossEventOccurredAtIso(match[1], parseInt(match[2], 10))
}
