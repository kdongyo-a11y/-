"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  generateDaySlots,
  getTodayDateString,
  type BossTimeSlot,
} from "@/lib/boss-time-slots"
import { type RosterMember } from "@/lib/member-types"
import { useCurrentMemberId } from "@/components/auth-context"
import {
  DEFAULT_SLOT_ADMIN_FLAGS,
  type SlotAdminFlags,
} from "@/lib/boss-admin-status"
import { bossApi, fetchBossEvents } from "@/lib/operations-api"

export type AttendeeMethod = "코드" | "수동추가"

export type Attendee = {
  memberId: string
  name: string
  checkedAt: number
  method: AttendeeMethod
}

export type AdminModificationLog = {
  id: string
  at: number
  targetMemberId: string
  targetName: string
  beforeState: "미참여" | "참여"
  afterState: "미참여" | "참여"
  memo: string
  action: "수동추가" | "수동제외"
}

export type SlotCheckStatus = "idle" | "open" | "closed"

export type SlotCheck = {
  slotId: string
  code: string
  status: SlotCheckStatus
  startedAt: number | null
  closedAt: number | null
  attendees: Attendee[]
  adminLogs: AdminModificationLog[]
  extraMainBosses: string[]
}

export type MemberSlotStatus = "미참여" | "참여" | "진행중" | "대기"

export type SessionParticipationRecord = {
  id: string
  slotId: string
  date: string
  time: string
  label: string
  result: "참여" | "미참여"
  checkedAt: number | null
  contributionPoints: number | null
}

export type ContributionRecord = {
  slotId: string
  time: string
  label: string
  points: number
}

type ParticipationContextValue = {
  slots: BossTimeSlot[]
  checks: Record<string, SlotCheck>
  slotAdminFlags: Record<string, SlotAdminFlags>
  openSlotId: string | null
  getCheck: (slotId: string) => SlotCheck
  getSlot: (slotId: string) => BossTimeSlot | undefined
  getOpenCheck: () => { slot: BossTimeSlot; check: SlotCheck } | null
  getMemberSlotStatus: (slotId: string, memberId: string) => MemberSlotStatus
  getMemberSessionRecords: (memberId: string) => SessionParticipationRecord[]
  getMemberContributionTotal: (memberId: string) => number
  getMemberContributionRecords: (memberId: string) => ContributionRecord[]
  // 관리자
  startCheck: (slotId: string) => Promise<{ ok: boolean; message: string }>
  closeCheck: (slotId: string) => void
  regenerateCode: (slotId: string) => void
  addAttendeeManual: (
    slotId: string,
    member: RosterMember,
    memo: string,
  ) => Promise<{ ok: boolean; message: string }>
  removeAttendeeManual: (
    slotId: string,
    member: RosterMember,
    memo: string,
  ) => Promise<{ ok: boolean; message: string }>
  setExtraMainBosses: (slotId: string, bosses: string[]) => void
  getSlotAdminFlags: (slotId: string) => SlotAdminFlags
  closeSlotWithNoIncome: (slotId: string) => Promise<{ ok: boolean; message: string }>
  declareSlotIncome: (slotId: string) => Promise<{ ok: boolean; message: string }>
  cancelNoIncomeSlot: (slotId: string) => Promise<{ ok: boolean; message: string }>
  // 혈원
  submitCode: (code: string) => Promise<{ ok: boolean; message: string }>
  hasJoined: (slotId: string, memberId: string) => boolean
  isLoading: boolean
  loadError: string | null
  retryLoad: () => Promise<void>
}

const ParticipationContext = createContext<ParticipationContextValue | null>(null)

function createEmptyCheck(slotId: string): SlotCheck {
  return {
    slotId,
    code: "",
    status: "idle",
    startedAt: null,
    closedAt: null,
    attendees: [],
    adminLogs: [],
    extraMainBosses: [],
  }
}

function ensureCheck(checks: Record<string, SlotCheck>, slotId: string): SlotCheck {
  return checks[slotId] ?? createEmptyCheck(slotId)
}

export function ParticipationProvider({ children }: { children: ReactNode }) {
  const currentMemberId = useCurrentMemberId()
  const today = getTodayDateString()
  const [slots] = useState<BossTimeSlot[]>(() => generateDaySlots(today))
  const [checks, setChecks] = useState<Record<string, SlotCheck>>({})
  const [slotAdminFlags, setSlotAdminFlags] = useState<Record<string, SlotAdminFlags>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshBossData = useCallback(async () => {
    const result = await fetchBossEvents()
    if (!result.ok) {
      setLoadError(result.message ?? "보스타임 기록을 불러오지 못했습니다.")
      return
    }
    setLoadError(null)
    setChecks(result.checks ?? {})
    setSlotAdminFlags(result.slotAdminFlags ?? {})
  }, [])

  const retryLoad = useCallback(async () => {
    setIsLoading(true)
    await refreshBossData()
    setIsLoading(false)
  }, [refreshBossData])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      await refreshBossData()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshBossData])

  const checksRef = useRef(checks)
  checksRef.current = checks
  const slotsRef = useRef(slots)
  slotsRef.current = slots

  const openSlotId = useMemo(() => {
    for (const [id, check] of Object.entries(checks)) {
      if (check.status === "open") return id
    }
    return null
  }, [checks])

  const getCheck = useCallback(
    (slotId: string) => ensureCheck(checks, slotId),
    [checks],
  )

  const getSlot = useCallback(
    (slotId: string) => {
      const fromToday = slots.find((s) => s.id === slotId)
      if (fromToday) return fromToday
      const date = slotId.slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return generateDaySlots(date).find((s) => s.id === slotId)
      }
      return undefined
    },
    [slots],
  )

  const getOpenCheck = useCallback(() => {
    if (!openSlotId) return null
    const slot = getSlot(openSlotId)
    const check = checks[openSlotId]
    if (!slot || !check || check.status !== "open") return null
    return { slot, check }
  }, [openSlotId, getSlot, checks])

  const hasJoined = useCallback(
    (slotId: string, memberId: string) =>
      ensureCheck(checks, slotId).attendees.some((a) => a.memberId === memberId),
    [checks],
  )

  const getMemberSlotStatus = useCallback(
    (slotId: string, memberId: string): MemberSlotStatus => {
      const check = ensureCheck(checks, slotId)
      if (check.status === "open") {
        return check.attendees.some((a) => a.memberId === memberId) ? "참여" : "진행중"
      }
      if (check.status === "closed") {
        return check.attendees.some((a) => a.memberId === memberId) ? "참여" : "미참여"
      }
      return "대기"
    },
    [checks],
  )

  const getMemberSessionRecords = useCallback(
    (memberId: string): SessionParticipationRecord[] => {
      return Object.keys(checks)
        .map((slotId) => {
          const slot = getSlot(slotId)
          if (!slot) return null
          const check = ensureCheck(checks, slotId)
          if (check.status === "idle") return null
          const attendee = check.attendees.find((a) => a.memberId === memberId)
          const participated = !!attendee
          const contributionPoints =
            check.status === "closed" && participated ? slot.contributionPoints : null
          return {
            id: `session-${slot.id}-${memberId}`,
            slotId: slot.id,
            date: slot.date,
            time: slot.time,
            label: slot.label,
            result: participated ? ("참여" as const) : ("미참여" as const),
            checkedAt: attendee?.checkedAt ?? null,
            contributionPoints,
          }
        })
        .filter((r): r is SessionParticipationRecord => r !== null)
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`))
    },
    [checks, getSlot],
  )

  const getMemberContributionRecords = useCallback(
    (memberId: string): ContributionRecord[] => {
      return Object.keys(checks)
        .map((slotId) => {
          const slot = getSlot(slotId)
          if (!slot) return null
          const check = ensureCheck(checks, slotId)
          if (
            check.status !== "closed" ||
            !check.attendees.some((a) => a.memberId === memberId)
          ) {
            return null
          }
          return {
            slotId: slot.id,
            time: slot.time,
            label: slot.label,
            points: slot.contributionPoints,
          }
        })
        .filter((r): r is ContributionRecord => r !== null)
    },
    [checks, getSlot],
  )

  const getMemberContributionTotal = useCallback(
    (memberId: string): number => {
      return getMemberContributionRecords(memberId).reduce((sum, r) => sum + r.points, 0)
    },
    [getMemberContributionRecords],
  )

  const startCheck = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const result = await bossApi.startCheck(slotId)
      if (!result.ok) {
        alert(result.message)
        return result
      }
      await refreshBossData()
      return result
    },
    [refreshBossData],
  )

  const closeCheck = useCallback(
    async (slotId: string) => {
      const result = await bossApi.closeCheck(slotId)
      if (!result.ok) {
        alert(result.message)
        return
      }
      await refreshBossData()
    },
    [refreshBossData],
  )

  const regenerateCode = useCallback(
    async (slotId: string) => {
      const result = await bossApi.regenerateCode(slotId)
      if (!result.ok) {
        alert(result.message)
        return
      }
      await refreshBossData()
    },
    [refreshBossData],
  )

  const addAttendeeManual = useCallback(
    async (slotId: string, member: RosterMember, memo: string) => {
      const result = await bossApi.manualParticipation({
        slotId,
        memberId: member.id,
        memo,
        action: "add",
      })
      if (result.ok) await refreshBossData()
      return result
    },
    [refreshBossData],
  )

  const removeAttendeeManual = useCallback(
    async (slotId: string, member: RosterMember, memo: string) => {
      const result = await bossApi.manualParticipation({
        slotId,
        memberId: member.id,
        memo,
        action: "remove",
      })
      if (result.ok) await refreshBossData()
      return result
    },
    [refreshBossData],
  )

  const setExtraMainBosses = useCallback(
    (slotId: string, bosses: string[]) => {
      void (async () => {
        await bossApi.updateEvent({
          slotId,
          action: "extra_bosses",
          extraMainBosses: bosses,
        })
        await refreshBossData()
      })()
    },
    [refreshBossData],
  )

  const getSlotAdminFlags = useCallback(
    (slotId: string): SlotAdminFlags => {
      return slotAdminFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS
    },
    [slotAdminFlags],
  )

  const closeSlotWithNoIncome = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const check = ensureCheck(checksRef.current, slotId)
      if (check.status !== "closed") {
        return { ok: false, message: "참여체크 마감 후 수익 없음으로 마감할 수 있습니다." }
      }
      const result = await bossApi.updateEvent({ slotId, action: "no_income" })
      if (result.ok) await refreshBossData()
      return result
    },
    [refreshBossData],
  )

  const declareSlotIncome = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const check = ensureCheck(checksRef.current, slotId)
      if (check.status !== "closed") {
        return { ok: false, message: "참여체크 마감 후 수익 발생을 등록할 수 있습니다." }
      }
      const flags = slotAdminFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS
      if (flags.noIncomeClosed) {
        return { ok: false, message: "이미 수익 없음으로 마감된 타임입니다." }
      }
      const result = await bossApi.updateEvent({ slotId, action: "declare_income" })
      if (result.ok) await refreshBossData()
      return result
    },
    [slotAdminFlags, refreshBossData],
  )

  const cancelNoIncomeSlot = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const flags = slotAdminFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS
      if (!flags.noIncomeClosed) {
        return { ok: false, message: "수익 없음으로 마감된 타임만 취소할 수 있습니다." }
      }
      const result = await bossApi.updateEvent({ slotId, action: "cancel_no_income" })
      if (result.ok) await refreshBossData()
      return result
    },
    [slotAdminFlags, refreshBossData],
  )

  const submitCode = useCallback(
    async (code: string): Promise<{ ok: boolean; message: string }> => {
      const result = await bossApi.joinByCode(code)
      if (result.ok) {
        await refreshBossData()
      }
      return result
    },
    [refreshBossData],
  )

  const value = useMemo<ParticipationContextValue>(
    () => ({
      slots,
      checks,
      slotAdminFlags,
      openSlotId,
      getCheck,
      getSlot,
      getOpenCheck,
      getMemberSlotStatus,
      getMemberSessionRecords,
      getMemberContributionTotal,
      getMemberContributionRecords,
      startCheck,
      closeCheck,
      regenerateCode,
      addAttendeeManual,
      removeAttendeeManual,
      setExtraMainBosses,
      getSlotAdminFlags,
      closeSlotWithNoIncome,
      declareSlotIncome,
      cancelNoIncomeSlot,
      submitCode,
      hasJoined,
      isLoading,
      loadError,
      retryLoad,
    }),
    [
      slots,
      checks,
      slotAdminFlags,
      openSlotId,
      getCheck,
      getSlot,
      getOpenCheck,
      getMemberSlotStatus,
      getMemberSessionRecords,
      getMemberContributionTotal,
      getMemberContributionRecords,
      startCheck,
      closeCheck,
      regenerateCode,
      addAttendeeManual,
      removeAttendeeManual,
      setExtraMainBosses,
      getSlotAdminFlags,
      closeSlotWithNoIncome,
      declareSlotIncome,
      cancelNoIncomeSlot,
      submitCode,
      hasJoined,
      isLoading,
      loadError,
      retryLoad,
    ],
  )

  return <ParticipationContext.Provider value={value}>{children}</ParticipationContext.Provider>
}

export function useParticipation() {
  const ctx = useContext(ParticipationContext)
  if (!ctx) throw new Error("useParticipation must be used within ParticipationProvider")
  return ctx
}

export { formatCheckTime } from "@/lib/boss-time-slots"
