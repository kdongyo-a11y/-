import { CONTRIBUTION_SIEGE } from "@/lib/boss-time-slots"

export { CONTRIBUTION_SIEGE as SIEGE_CONTRIBUTION_POINTS }

export function makeSiegeId(eventDate: string): string {
  return `siege-${eventDate}`
}

export function formatSiegeTitle(eventDate: string): string {
  return `${eventDate} 공성`
}

export function formatSiegeTimeRange(startTime: string, endTime: string): string {
  return `${startTime} ~ ${endTime}`
}

export function formatSiegeDisplay(eventDate: string, startTime: string, endTime: string): string {
  return `${formatSiegeTitle(eventDate)}\n${formatSiegeTimeRange(startTime, endTime)}`
}

/** 해당 날짜가 일요일인지 */
export function isSundayDate(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00")
  return d.getDay() === 0
}

/** 오늘 또는 이후 가장 가까운 일요일 (YYYY-MM-DD) */
export function getUpcomingSunday(from = new Date()): string {
  const d = new Date(from)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const daysUntil = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + daysUntil)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dayNum = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dayNum}`
}

/** 이번 주 일요일 (과거면 다음 일요일) */
export function getThisWeekSunday(): string {
  return getUpcomingSunday()
}