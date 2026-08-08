// 보스타임(time slot) 정의 및 일정 생성 — 하루 16타임

export type TimeSlotType = "main" | "general"

/** 03 / 09 / 15 / 21시 — 메인타임 (기여 1.5점) */
export const MAIN_SLOT_HOURS = [3, 9, 15, 21] as const

/** 00 / 01 / 05 / 06 / 07 / 11 / 12 / 13 / 17 / 18 / 19 / 23시 — 일반타임 (기여 1점) */
export const GENERAL_SLOT_HOURS = [0, 1, 5, 6, 7, 11, 12, 13, 17, 18, 19, 23] as const

export const ALL_SLOT_HOURS = [...GENERAL_SLOT_HOURS, ...MAIN_SLOT_HOURS].sort(
  (a, b) => a - b,
) as number[]

/** 메인타임 확정 스폰 (카스파 · 드레이크 · 이프리트) */
export const MAIN_FIXED_BOSSES = ["카스파", "드레이크", "이프리트"] as const

/** 메인타임 추가 보스 (0~9개, 각각 독립 스폰) — 가치 높은 순 */
export const MAIN_EXTRA_BOSSES = [
  "데몬",
  "얼음여왕",
  "피닉스",
  "데스나이트",
  "바포메트",
  "커츠",
  "도펠보스",
  "여왕개미",
  "흑장로",
] as const

export const GENERAL_BOSSES_IFRIT_DRAKE = ["이프리트", "드레이크"] as const
export const GENERAL_BOSSES_KASPA_NECRO = ["카스파", "네크로맨서"] as const

/** 타임당 기여도 (보스 마릿수와 무관) */
export const CONTRIBUTION_GENERAL = 1
export const CONTRIBUTION_MAIN = 1.5
export const CONTRIBUTION_SIEGE = 2

type SlotHourConfig = {
  type: TimeSlotType
  spawnBosses: readonly string[]
  contributionPoints: number
}

/** 시간별 보스타임 정의 */
const SLOT_BY_HOUR: Record<number, SlotHourConfig> = {
  0: { type: "general", spawnBosses: GENERAL_BOSSES_IFRIT_DRAKE, contributionPoints: CONTRIBUTION_GENERAL },
  1: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  3: { type: "main", spawnBosses: MAIN_FIXED_BOSSES, contributionPoints: CONTRIBUTION_MAIN },
  5: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  6: { type: "general", spawnBosses: GENERAL_BOSSES_IFRIT_DRAKE, contributionPoints: CONTRIBUTION_GENERAL },
  7: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  9: { type: "main", spawnBosses: MAIN_FIXED_BOSSES, contributionPoints: CONTRIBUTION_MAIN },
  11: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  12: { type: "general", spawnBosses: GENERAL_BOSSES_IFRIT_DRAKE, contributionPoints: CONTRIBUTION_GENERAL },
  13: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  15: { type: "main", spawnBosses: MAIN_FIXED_BOSSES, contributionPoints: CONTRIBUTION_MAIN },
  17: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  18: { type: "general", spawnBosses: GENERAL_BOSSES_IFRIT_DRAKE, contributionPoints: CONTRIBUTION_GENERAL },
  19: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
  21: { type: "main", spawnBosses: MAIN_FIXED_BOSSES, contributionPoints: CONTRIBUTION_MAIN },
  23: { type: "general", spawnBosses: GENERAL_BOSSES_KASPA_NECRO, contributionPoints: CONTRIBUTION_GENERAL },
}

export type BossTimeSlot = {
  id: string
  date: string
  time: string
  hour: number
  type: TimeSlotType
  label: string
  spawnBosses: readonly string[]
  contributionPoints: number
}

export function formatSlotTime(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

export function makeSlotId(date: string, hour: number): string {
  return `${date}-${String(hour).padStart(2, "0")}`
}

export function getSlotLabel(type: TimeSlotType): string {
  return type === "main" ? "메인타임" : "일반타임"
}

export function getSlotBossSummary(slot: BossTimeSlot, extraMainBosses: string[] = []): string {
  if (slot.type === "main") {
    if (extraMainBosses.length === 0) {
      return slot.spawnBosses.join(" · ")
    }
    return [...slot.spawnBosses, ...extraMainBosses].join(" · ")
  }
  return slot.spawnBosses.join(" · ")
}

export function formatContributionPoints(points: number): string {
  return Number.isInteger(points) ? `${points}점` : `${points}점`
}

/** 특정 날짜의 16개 보스타임 생성 (시간순) */
export function generateDaySlots(date: string): BossTimeSlot[] {
  return ALL_SLOT_HOURS.map((hour) => {
    const config = SLOT_BY_HOUR[hour]
    return {
      id: makeSlotId(date, hour),
      date,
      time: formatSlotTime(hour),
      hour,
      type: config.type,
      label: getSlotLabel(config.type),
      spawnBosses: config.spawnBosses,
      contributionPoints: config.contributionPoints,
    }
  })
}

/** 현재 시각과의 시차(0~12) — 가까운 타임 정렬용 */
export function hourDistanceFromNow(hour: number, nowHour = new Date().getHours()): number {
  const diff = Math.abs(hour - nowHour)
  return Math.min(diff, 24 - diff)
}

/** 홈 등에서 현재 시간 기준 가까운 타임 N개 */
export function getNearbySlots(slots: BossTimeSlot[], count = 5): BossTimeSlot[] {
  return [...slots]
    .sort((a, b) => hourDistanceFromNow(a.hour) - hourDistanceFromNow(b.hour))
    .slice(0, count)
}

/** 오늘 날짜 문자열 (YYYY-MM-DD) */
export function getTodayDateString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const d = new Date(`${dateStr}T12:00:00`)
  d.setDate(d.getDate() + deltaDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** 슬롯 시작 시각 (로컬) */
export function getSlotStartDate(slot: BossTimeSlot): Date {
  return new Date(`${slot.date}T${String(slot.hour).padStart(2, "0")}:00:00`)
}

/** 현재 시각 기준 남은 시간 라벨 */
export function formatTimeUntilSlot(slot: BossTimeSlot, now = new Date()): string {
  const diffMs = getSlotStartDate(slot).getTime() - now.getTime()
  if (diffMs <= 0) return "진행 중"

  const totalMin = Math.floor(diffMs / 60_000)
  if (totalMin <= 10) return `곧 시작 · ${totalMin}분 후`
  if (totalMin < 60) return `${totalMin}분 후`

  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  return mins > 0 ? `${hours}시간 ${mins}분 후` : `${hours}시간 후`
}

/** 출현 몬스터 목록 (메인타임 extra 포함) */
export function getSlotSpawnBosses(slot: BossTimeSlot, extraMainBosses: string[] = []): string[] {
  if (slot.type === "main" && extraMainBosses.length > 0) {
    return [...slot.spawnBosses, ...extraMainBosses]
  }
  return [...slot.spawnBosses]
}

/**
 * 현재 시각 이후 타임만 시간순으로 반환.
 * 오늘 남은 타임이 부족하면 다음 날 타임을 이어 붙입니다.
 */
export function getUpcomingBossSlots(
  todaySlots: BossTimeSlot[],
  maxCount: number,
  now = new Date(),
): BossTimeSlot[] {
  const today = getTodayDateString()
  const futureToday = todaySlots
    .filter((s) => getSlotStartDate(s) > now)
    .sort((a, b) => getSlotStartDate(a).getTime() - getSlotStartDate(b).getTime())

  if (futureToday.length >= maxCount) {
    return futureToday.slice(0, maxCount)
  }

  const tomorrowSlots = generateDaySlots(shiftDateString(today, 1))
  return [...futureToday, ...tomorrowSlots].slice(0, maxCount)
}

export function formatCheckTime(epochMs: number): string {
  const d = new Date(epochMs)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

export function getSlotConfig(hour: number): SlotHourConfig {
  return SLOT_BY_HOUR[hour]
}
