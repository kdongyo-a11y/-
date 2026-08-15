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
import { bossApi, fetchBossEvents, type BossMutationResult } from "@/lib/operations-api"
import type { BossSlotPatchResponse } from "@/lib/home-bootstrap-types"
import { mergeBossSlotPatch } from "@/lib/boss-patch-utils"
import { trackInteraction } from "@/lib/interaction-perf"
import { pendingKeys } from "@/lib/pending-keys"

export type AttendeeMethod = "코드" | "수동추가"

export type Attendee = {
  memberId: string
  name: string
  checkedAt: number
  method: AttendeeMethod
  /** Optimistic in-flight state — stripped on server reconcile */
  pending?: "adding" | "removing"
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
  closeCheck: (slotId: string) => Promise<void>
  regenerateCode: (slotId: string) => Promise<void>
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
  addAttendeesManualBatch: (
    slotId: string,
    members: RosterMember[],
    memo: string,
  ) => Promise<BossMutationResult>
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
  ensureFullBossDataLoaded: () => Promise<void>
  applyBossPatch: (patch?: BossSlotPatchResponse) => void
  isMutationPending: (key: string) => boolean
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

export function ParticipationProvider({
  children,
  initialChecks,
  initialSlotAdminFlags,
  skipInitialFetch = false,
}: {
  children: ReactNode
  initialChecks?: Record<string, SlotCheck>
  initialSlotAdminFlags?: Record<string, SlotAdminFlags>
  skipInitialFetch?: boolean
}) {
  const currentMemberId = useCurrentMemberId()
  const today = getTodayDateString()
  const [slots] = useState<BossTimeSlot[]>(() => generateDaySlots(today))
  const [checks, setChecks] = useState<Record<string, SlotCheck>>(initialChecks ?? {})
  const [slotAdminFlags, setSlotAdminFlags] = useState<Record<string, SlotAdminFlags>>(
    initialSlotAdminFlags ?? {},
  )
  const [isLoading, setIsLoading] = useState(!skipInitialFetch)
  const [loadError, setLoadError] = useState<string | null>(null)
  const fullBossDataLoadedRef = useRef(false)
  const [pendingMutations, setPendingMutations] = useState<Set<string>>(() => new Set())
  const extraBossLatestRef = useRef<Map<string, string[]>>(new Map())

  const setMutationPending = useCallback((key: string, pending: boolean) => {
    setPendingMutations((prev) => {
      const next = new Set(prev)
      if (pending) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const isMutationPending = useCallback(
    (key: string) => pendingMutations.has(key),
    [pendingMutations],
  )

  const patchBossSlots = useCallback((patch?: BossSlotPatchResponse) => {
    if (!patch) return
    setChecks((prevChecks) => {
      if (Object.keys(patch.checks).length === 0) return prevChecks
      return mergeBossSlotPatch(prevChecks, {}, patch).checks
    })
    setSlotAdminFlags((prevFlags) => {
      if (Object.keys(patch.slotAdminFlags).length === 0) return prevFlags
      return mergeBossSlotPatch({}, prevFlags, patch).slotAdminFlags
    })
  }, [])

  const refreshBossData = useCallback(async (scope: "home" | "full" = "full") => {
    const result = await fetchBossEvents(scope)
    if (!result.ok) {
      setLoadError(result.message ?? "보스타임 기록을 불러오지 못했습니다.")
      return
    }
    setLoadError(null)
    setChecks(result.checks ?? {})
    setSlotAdminFlags(result.slotAdminFlags ?? {})
    if (scope === "full") {
      fullBossDataLoadedRef.current = true
    }
  }, [])

  const ensureFullBossDataLoaded = useCallback(async () => {
    if (fullBossDataLoadedRef.current) return
    await refreshBossData("full")
  }, [refreshBossData])

  const retryLoad = useCallback(async () => {
    setIsLoading(true)
    await refreshBossData("full")
    setIsLoading(false)
  }, [refreshBossData])

  useEffect(() => {
    if (skipInitialFetch) {
      setIsLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      await refreshBossData("full")
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshBossData, skipInitialFetch])

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
      const key = `boss-start:${slotId}`
      if (pendingMutations.has(key)) {
        return { ok: false, message: "처리 중입니다." }
      }
      const tracker = trackInteraction("boss-check-start")
      tracker.markPending()
      setMutationPending(key, true)
      try {
        const result = await bossApi.startCheck(slotId)
        if (!result.ok) {
          alert(result.message)
          tracker.finish({ ok: false })
          return result
        }
        patchBossSlots(result.patch)
        tracker.finish({ ok: true })
        return result
      } catch {
        tracker.finish({ error: true })
        return { ok: false, message: "처리 중 오류가 발생했습니다." }
      } finally {
        setMutationPending(key, false)
      }
    },
    [patchBossSlots, pendingMutations, setMutationPending],
  )

  const closeCheck = useCallback(
    async (slotId: string) => {
      const key = `boss-close:${slotId}`
      if (pendingMutations.has(key)) return
      const tracker = trackInteraction("boss-check-close")
      tracker.markPending()
      setMutationPending(key, true)
      try {
        const result = await bossApi.closeCheck(slotId)
        if (!result.ok) {
          alert(result.message)
          tracker.finish({ ok: false })
          return
        }
        patchBossSlots(result.patch)
        tracker.finish({ ok: true })
      } catch {
        tracker.finish({ error: true })
      } finally {
        setMutationPending(key, false)
      }
    },
    [patchBossSlots, pendingMutations, setMutationPending],
  )

  const regenerateCode = useCallback(
    async (slotId: string) => {
      const key = `boss-regenerate:${slotId}`
      if (pendingMutations.has(key)) return
      const tracker = trackInteraction("boss-regenerate-code")
      tracker.markPending()
      setMutationPending(key, true)
      try {
        const result = await bossApi.regenerateCode(slotId)
        if (!result.ok) {
          alert(result.message)
          tracker.finish({ ok: false })
          return
        }
        patchBossSlots(result.patch)
        tracker.finish({ ok: true })
      } catch {
        tracker.finish({ error: true })
      } finally {
        setMutationPending(key, false)
      }
    },
    [patchBossSlots, pendingMutations, setMutationPending],
  )

  const mutateBossAttendeesManual = useCallback(
    async (
      slotId: string,
      ops: Array<{ member: RosterMember; action: "add" | "remove" }>,
      memo: string,
      interactionKind: "boss-manual-add" | "boss-manual-remove" | "boss-manual-batch",
    ): Promise<BossMutationResult> => {
      if (ops.length === 0) {
        return { ok: false, message: "처리할 혈원이 없습니다." }
      }

      for (const op of ops) {
        const key =
          op.action === "add"
            ? pendingKeys.bossManualAdd(slotId, op.member.id)
            : pendingKeys.bossManualRemove(slotId, op.member.id)
        if (pendingMutations.has(key)) {
          return { ok: false, message: "처리 중입니다." }
        }
      }

      const snapshot = [...(checksRef.current[slotId]?.attendees ?? [])]
      const tracker = trackInteraction(interactionKind)
      tracker.markPending()

      for (const op of ops) {
        const key =
          op.action === "add"
            ? pendingKeys.bossManualAdd(slotId, op.member.id)
            : pendingKeys.bossManualRemove(slotId, op.member.id)
        setMutationPending(key, true)
      }

      setChecks((prev) => {
        let attendees = [...ensureCheck(prev, slotId).attendees]
        for (const op of ops) {
          if (op.action === "add") {
            attendees = attendees.filter((a) => a.memberId !== op.member.id)
            attendees.push({
              memberId: op.member.id,
              name: op.member.nickname,
              checkedAt: Date.now(),
              method: "수동추가" as const,
              pending: "adding" as const,
            })
          } else {
            attendees = attendees.filter((a) => a.memberId !== op.member.id)
          }
        }
        return {
          ...prev,
          [slotId]: { ...ensureCheck(prev, slotId), attendees },
        }
      })

      try {
        const result = await bossApi.manualParticipationBatch({
          slotId,
          memo,
          batch: ops.map((op) => ({
            memberId: op.member.id,
            action: op.action,
            memo,
          })),
        })

        const failedIds = new Set(
          (result.results ?? []).filter((r) => !r.ok).map((r) => r.memberId),
        )

        if (result.ok) {
          patchBossSlots(result.patch)
        } else if (failedIds.size > 0) {
          setChecks((prev) => {
            const cur = ensureCheck(prev, slotId)
            const kept = cur.attendees.filter(
              (a) => !a.pending || !failedIds.has(a.memberId),
            )
            const restoredFromSnapshot = snapshot.filter((a) => failedIds.has(a.memberId))
            const mergedIds = new Set(kept.map((a) => a.memberId))
            const restored = restoredFromSnapshot.filter((a) => !mergedIds.has(a.memberId))
            return {
              ...prev,
              [slotId]: { ...cur, attendees: [...kept, ...restored] },
            }
          })
          if (result.patch) patchBossSlots(result.patch)
        } else {
          setChecks((prev) => ({
            ...prev,
            [slotId]: { ...ensureCheck(prev, slotId), attendees: snapshot },
          }))
        }

        tracker.finish({ ok: result.ok })
        return result
      } catch {
        setChecks((prev) => ({
          ...prev,
          [slotId]: { ...ensureCheck(prev, slotId), attendees: snapshot },
        }))
        tracker.finish({ error: true })
        return { ok: false, message: "처리 중 오류가 발생했습니다." }
      } finally {
        for (const op of ops) {
          const key =
            op.action === "add"
              ? pendingKeys.bossManualAdd(slotId, op.member.id)
              : pendingKeys.bossManualRemove(slotId, op.member.id)
          setMutationPending(key, false)
        }
      }
    },
    [patchBossSlots, pendingMutations, setMutationPending],
  )

  const addAttendeeManual = useCallback(
    async (slotId: string, member: RosterMember, memo: string) => {
      const result = await mutateBossAttendeesManual(
        slotId,
        [{ member, action: "add" }],
        memo,
        "boss-manual-add",
      )
      const item = result.results?.find((r) => r.memberId === member.id)
      return {
        ok: item?.ok ?? result.ok,
        message: item?.message ?? result.message ?? "처리 중 오류가 발생했습니다.",
      }
    },
    [mutateBossAttendeesManual],
  )

  const removeAttendeeManual = useCallback(
    async (slotId: string, member: RosterMember, memo: string) => {
      const result = await mutateBossAttendeesManual(
        slotId,
        [{ member, action: "remove" }],
        memo,
        "boss-manual-remove",
      )
      const item = result.results?.find((r) => r.memberId === member.id)
      return {
        ok: item?.ok ?? result.ok,
        message: item?.message ?? result.message ?? "처리 중 오류가 발생했습니다.",
      }
    },
    [mutateBossAttendeesManual],
  )

  const addAttendeesManualBatch = useCallback(
    async (
      slotId: string,
      members: RosterMember[],
      memo: string,
    ): Promise<BossMutationResult> => {
      if (members.length === 0) {
        return { ok: false, message: "추가할 혈원을 선택해주세요." }
      }
      return mutateBossAttendeesManual(
        slotId,
        members.map((member) => ({ member, action: "add" as const })),
        memo,
        members.length === 1 ? "boss-manual-add" : "boss-manual-batch",
      )
    },
    [mutateBossAttendeesManual],
  )

  const setExtraMainBosses = useCallback(
    (slotId: string, bosses: string[]) => {
      const key = `boss-extra-boss:${slotId}`
      if (pendingMutations.has(key)) return

      const prevBosses = checksRef.current[slotId]?.extraMainBosses ?? []
      extraBossLatestRef.current.set(slotId, bosses)

      setChecks((prev) => ({
        ...prev,
        [slotId]: { ...ensureCheck(prev, slotId), extraMainBosses: bosses },
      }))

      const tracker = trackInteraction("boss-extra-main-toggle")
      tracker.markPending()
      setMutationPending(key, true)

      void (async () => {
        try {
          const result = await bossApi.updateEvent({
            slotId,
            action: "extra_bosses",
            extraMainBosses: bosses,
          })

          const latest = extraBossLatestRef.current.get(slotId)
          const stale = latest != null && JSON.stringify(latest) !== JSON.stringify(bosses)

          if (!result.ok) {
            if (!stale) {
              setChecks((prev) => ({
                ...prev,
                [slotId]: { ...ensureCheck(prev, slotId), extraMainBosses: prevBosses },
              }))
            }
            tracker.finish({ ok: false })
            return
          }

          if (result.patch && !stale) {
            patchBossSlots(result.patch)
          }
          tracker.finish({ ok: true })
        } catch {
          const latest = extraBossLatestRef.current.get(slotId)
          if (latest == null || JSON.stringify(latest) === JSON.stringify(bosses)) {
            setChecks((prev) => ({
              ...prev,
              [slotId]: { ...ensureCheck(prev, slotId), extraMainBosses: prevBosses },
            }))
          }
          tracker.finish({ error: true })
        } finally {
          setMutationPending(key, false)
        }
      })()
    },
    [patchBossSlots, pendingMutations, setMutationPending],
  )

  const getSlotAdminFlags = useCallback(
    (slotId: string): SlotAdminFlags => {
      return slotAdminFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS
    },
    [slotAdminFlags],
  )

  const closeSlotWithNoIncome = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const key = `boss-income:${slotId}`
      if (pendingMutations.has(key)) {
        return { ok: false, message: "처리 중입니다." }
      }
      const check = ensureCheck(checksRef.current, slotId)
      if (check.status !== "closed") {
        return { ok: false, message: "참여체크 마감 후 수익 없음으로 마감할 수 있습니다." }
      }
      setMutationPending(key, true)
      try {
        const result = await bossApi.updateEvent({ slotId, action: "no_income" })
        if (result.ok) patchBossSlots(result.patch)
        return result
      } finally {
        setMutationPending(key, false)
      }
    },
    [patchBossSlots, pendingMutations, setMutationPending],
  )

  const declareSlotIncome = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const key = `boss-income:${slotId}`
      if (pendingMutations.has(key)) {
        return { ok: false, message: "처리 중입니다." }
      }
      const check = ensureCheck(checksRef.current, slotId)
      if (check.status !== "closed") {
        return { ok: false, message: "참여체크 마감 후 수익 발생을 등록할 수 있습니다." }
      }
      const flags = slotAdminFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS
      if (flags.noIncomeClosed) {
        return { ok: false, message: "이미 수익 없음으로 마감된 타임입니다." }
      }
      setMutationPending(key, true)
      try {
        const result = await bossApi.updateEvent({ slotId, action: "declare_income" })
        if (result.ok) patchBossSlots(result.patch)
        return result
      } finally {
        setMutationPending(key, false)
      }
    },
    [slotAdminFlags, patchBossSlots, pendingMutations, setMutationPending],
  )

  const cancelNoIncomeSlot = useCallback(
    async (slotId: string): Promise<{ ok: boolean; message: string }> => {
      const key = `boss-income:${slotId}`
      if (pendingMutations.has(key)) {
        return { ok: false, message: "처리 중입니다." }
      }
      const flags = slotAdminFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS
      if (!flags.noIncomeClosed) {
        return { ok: false, message: "수익 없음으로 마감된 타임만 취소할 수 있습니다." }
      }
      setMutationPending(key, true)
      try {
        const result = await bossApi.updateEvent({ slotId, action: "cancel_no_income" })
        if (result.ok) patchBossSlots(result.patch)
        return result
      } finally {
        setMutationPending(key, false)
      }
    },
    [slotAdminFlags, patchBossSlots, pendingMutations, setMutationPending],
  )

  const submitCode = useCallback(
    async (code: string): Promise<{ ok: boolean; message: string }> => {
      const key = "boss-join-code"
      if (pendingMutations.has(key)) {
        return { ok: false, message: "처리 중입니다." }
      }
      const tracker = trackInteraction("boss-participation-join")
      tracker.markPending()
      setMutationPending(key, true)
      try {
        const result = await bossApi.joinByCode(code)
        if (result.ok) {
          patchBossSlots(result.patch)
        }
        tracker.finish({ ok: result.ok })
        return result
      } catch {
        tracker.finish({ error: true })
        return { ok: false, message: "처리 중 오류가 발생했습니다." }
      } finally {
        setMutationPending(key, false)
      }
    },
    [patchBossSlots, pendingMutations, setMutationPending],
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
      addAttendeesManualBatch,
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
      ensureFullBossDataLoaded,
      applyBossPatch: patchBossSlots,
      isMutationPending,
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
      addAttendeesManualBatch,
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
      ensureFullBossDataLoaded,
      patchBossSlots,
      isMutationPending,
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
