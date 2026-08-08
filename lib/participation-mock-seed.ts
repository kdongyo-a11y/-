import { makeSlotId } from "@/lib/boss-time-slots"
import type { SlotCheck } from "@/components/participation-context"

function createClosedCheck(
  slotId: string,
  attendees: Array<{ memberId: string; name: string }>,
): SlotCheck {
  return {
    slotId,
    code: "",
    status: "closed",
    startedAt: Date.now() - 86_400_000,
    closedAt: Date.now() - 86_400_000 + 3_600_000,
    attendees: attendees.map((a, i) => ({
      ...a,
      checkedAt: Date.now() - 86_400_000 + i * 1000,
      method: "코드" as const,
    })),
    adminLogs: [],
    extraMainBosses: [],
  }
}

/** 8월 기여도 데모용 과거 참여 기록 */
export function buildMockHistoricalChecks(): Record<string, SlotCheck> {
  const checks: Record<string, SlotCheck> = {}
  const slotsByDay: Array<{ date: string; hours: number[] }> = [
    { date: "2026-08-01", hours: [15, 18] },
    { date: "2026-08-02", hours: [3, 9, 11] },
    { date: "2026-08-03", hours: [6, 12, 21] },
    { date: "2026-08-04", hours: [0, 7, 15] },
    { date: "2026-08-05", hours: [1, 9, 17, 19] },
  ]

  for (const { date, hours } of slotsByDay) {
    for (const hour of hours) {
      const slotId = makeSlotId(date, hour)
      checks[slotId] = createClosedCheck(slotId, [
        { memberId: "u-102", name: "홍길동" },
        { memberId: "u-103", name: "달빛기사" },
        { memberId: "u-105", name: "붉은장미" },
      ])
    }
  }

  checks[makeSlotId("2026-08-06", 15)] = createClosedCheck(makeSlotId("2026-08-06", 15), [
    { memberId: "u-102", name: "홍길동" },
  ])

  return checks
}
