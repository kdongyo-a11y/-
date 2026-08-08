import type { SlotCheck } from "@/components/participation-context"
import type { SiegeEvent } from "@/components/siege-context"
import { generateDaySlots, MAIN_SLOT_HOURS, type BossTimeSlot } from "@/lib/boss-time-slots"
import {
  resolveContributionScoresForDate,
  type ContributionScoreSetting,
} from "@/lib/contribution-score-settings"

export type ContributionPeriod = {
  start: string
  end: string
  label: string
}

export type ContributionKind = "general" | "main" | "siege"

export type ContributionEvent = {
  id: string
  date: string
  time: string
  label: string
  sub: string
  points: number
  kind: ContributionKind
}

export type ContributionBreakdown = {
  generalCount: number
  generalPoints: number
  mainCount: number
  mainPoints: number
  siegeCount: number
  siegePoints: number
  total: number
}

export type MemberContributionResult = {
  breakdown: ContributionBreakdown
  events: ContributionEvent[]
}

const MAIN_HOURS = new Set<number>(MAIN_SLOT_HOURS)

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

export function getYearMonth(dateStr: string): string {
  return dateStr.slice(0, 7)
}

export function getThisMonthPeriod(refDate = getTodayDateString()): ContributionPeriod {
  const ym = getYearMonth(refDate)
  const [y, m] = ym.split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
    label: `${y}년 ${m}월`,
  }
}

export function getLastMonthPeriod(refDate = getTodayDateString()): ContributionPeriod {
  const d = new Date(refDate + "T12:00:00")
  d.setMonth(d.getMonth() - 1)
  const ym = getYearMonth(d.toISOString().slice(0, 10))
  const [y, m] = ym.split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, "0")}`,
    label: `${y}년 ${m}월`,
  }
}

/** 참여 기록 전체 구간 — 기여도 누적 정렬용 */
export function getAllTimePeriod(refDate = getTodayDateString()): ContributionPeriod {
  return {
    start: "2000-01-01",
    end: refDate,
    label: "전체",
  }
}

export function getYearMonthPeriod(yearMonth: string): ContributionPeriod {
  const [y, m] = yearMonth.split("-").map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return {
    start: `${yearMonth}-01`,
    end: `${yearMonth}-${String(lastDay).padStart(2, "0")}`,
    label: `${y}년 ${m}월`,
  }
}

export function isDateInPeriod(date: string, period: ContributionPeriod): boolean {
  return date >= period.start && date <= period.end
}

function resolveSlot(slotId: string): BossTimeSlot | undefined {
  const date = slotId.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  return generateDaySlots(date).find((s) => s.id === slotId)
}

const SIEGE_ELIGIBLE = new Set(["attendance_confirmed", "settling", "completed"])

export function computeMemberContribution(
  memberId: string,
  period: ContributionPeriod,
  checks: Record<string, SlotCheck>,
  sieges: SiegeEvent[],
  scoreSettings: ContributionScoreSetting[] = [],
): MemberContributionResult {
  const events: ContributionEvent[] = []

  for (const [slotId, check] of Object.entries(checks)) {
    if (check.status !== "closed") continue
    if (!check.attendees.some((a) => a.memberId === memberId)) continue

    const slot = resolveSlot(slotId)
    if (!slot) continue
    if (!isDateInPeriod(slot.date, period)) continue

    const kind: ContributionKind = slot.type === "main" ? "main" : "general"
    const scores = resolveContributionScoresForDate(scoreSettings, slot.date)
    const points = kind === "main" ? scores.mainBossScore : scores.generalBossScore
    events.push({
      id: `c-boss-${slotId}-${memberId}`,
      date: slot.date,
      time: slot.time,
      label: slot.type === "main" ? "메인 보스타임" : "일반 보스타임",
      sub: `${slot.date.slice(5).replace("-", "/")} ${slot.time} ${slot.label}`,
      points,
      kind,
    })
  }

  for (const siege of sieges) {
    if (!SIEGE_ELIGIBLE.has(siege.status)) continue
    if (!isDateInPeriod(siege.eventDate, period)) continue
    if (!siege.confirmedAttendees.some((a) => a.memberId === memberId)) continue

    const scores = resolveContributionScoresForDate(scoreSettings, siege.eventDate)
    events.push({
      id: `c-siege-${siege.id}-${memberId}`,
      date: siege.eventDate,
      time: siege.startTime,
      label: "공성",
      sub: `${siege.eventDate.slice(5).replace("-", "/")} 공성`,
      points: scores.siegeScore,
      kind: "siege",
    })
  }

  events.sort((a, b) => {
    const da = `${a.date} ${a.time}`
    const db = `${b.date} ${b.time}`
    return da.localeCompare(db)
  })

  let generalCount = 0
  let generalPoints = 0
  let mainCount = 0
  let mainPoints = 0
  let siegeCount = 0
  let siegePoints = 0

  for (const e of events) {
    if (e.kind === "general") {
      generalCount++
      generalPoints += e.points
    } else if (e.kind === "main") {
      mainCount++
      mainPoints += e.points
    } else {
      siegeCount++
      siegePoints += e.points
    }
  }

  return {
    breakdown: {
      generalCount,
      generalPoints,
      mainCount,
      mainPoints,
      siegeCount,
      siegePoints,
      total: generalPoints + mainPoints + siegePoints,
    },
    events,
  }
}

export function computeGuildContributionSummary(
  memberIds: string[],
  period: ContributionPeriod,
  checks: Record<string, SlotCheck>,
  sieges: SiegeEvent[],
  scoreSettings: ContributionScoreSetting[] = [],
) {
  let totalRecords = 0
  let totalPoints = 0
  const ranked = memberIds.map((id) => {
    const result = computeMemberContribution(id, period, checks, sieges, scoreSettings)
    totalRecords += result.events.length
    totalPoints += result.breakdown.total
    return { memberId: id, ...result }
  })

  ranked.sort((a, b) => b.breakdown.total - a.breakdown.total)

  const activeCount = memberIds.length
  const average = activeCount > 0 ? totalPoints / activeCount : 0
  const top = ranked[0]

  return { ranked, totalRecords, totalPoints, average, top }
}

/** slot hour from id — for validation */
export function isMainHour(hour: number): boolean {
  return MAIN_HOURS.has(hour)
}
