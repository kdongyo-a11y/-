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
import { type Member, type RosterMember } from "@/lib/member-types"
import { useMembers } from "@/components/members-context"
import { useCurrentMemberId } from "@/components/auth-context"
import {
  formatSiegeTimeRange,
  getThisWeekSunday,
  isSundayDate,
  makeSiegeId,
  SIEGE_CONTRIBUTION_POINTS,
} from "@/lib/siege-utils"
import {
  DEFAULT_SIEGE_FINANCIAL_FLAGS,
  type SiegeFinancialFlags,
} from "@/lib/siege-admin-status"
import { makeSettlementKey } from "@/lib/settlement-types"
import { fetchSiegeEvents, siegeApi } from "@/lib/operations-api"

/** 공성 이벤트 진행 상태 */
export type SiegeStatus =
  | "draft"
  | "survey_open"
  | "survey_closed"
  | "attendance_confirming"
  | "attendance_confirmed"
  | "settling"
  | "completed"

export type SurveyResponse = "참여 예정" | "불참 예정"
export type MemberSurveyStatus = SurveyResponse | "미응답"

export type SiegeSurveyEntry = {
  memberId: string
  name: string
  response: SurveyResponse
  respondedAt: number
}

export type ConfirmedAttendeeMethod = "참여 확정" | "관리자 수동추가"

export type SiegeConfirmedAttendee = {
  memberId: string
  name: string
  confirmedAt: number
  method: ConfirmedAttendeeMethod
  /** 사전조사에서 참여 예정이었는지 */
  wasSurveyIntended: boolean
}

export type SiegeAttendanceChangeType = "ADD" | "REMOVE"

/** 실제 참여 확정 후 추가/제외 변경 기록 */
export type SiegeAttendanceChangeLog = {
  id: string
  memberId: string
  name: string
  changeType: SiegeAttendanceChangeType
  beforeState: string
  afterState: string
  reason: string
  changedAt: number
  adminId: string
}

export type SiegeAdminLog = {
  id: string
  at: number
  phase: "survey" | "attendance"
  targetMemberId: string
  targetName: string
  beforeState: string
  afterState: string
  memo: string
  action: string
}

export type SiegeEvent = {
  id: string
  eventDate: string
  startTime: string
  endTime: string
  status: SiegeStatus
  memo: string
  settlementId: string | null
  surveyResponses: SiegeSurveyEntry[]
  surveyOpenedAt: number | null
  surveyClosedAt: number | null
  confirmedAttendees: SiegeConfirmedAttendee[]
  attendanceConfirmedAt: number | null
  /** 사전조사 수정 기록 */
  manualAdjustments: SiegeAdminLog[]
  /** 실제 참여 확정 후 ADD/REMOVE 변경 기록 */
  attendanceChangeLogs: SiegeAttendanceChangeLog[]
  /** 재정 처리 플래그 (참여확정 이후) */
  financialFlags: SiegeFinancialFlags
}

export type SiegeSurveyStats = {
  total: number
  intended: number
  declined: number
  noResponse: number
}

export type SiegeContributionRecord = {
  siegeId: string
  eventDate: string
  timeRange: string
  points: number
}

export type SiegeSessionRecord = {
  id: string
  siegeId: string
  eventDate: string
  startTime: string
  endTime: string
  surveyStatus: MemberSurveyStatus
  actuallyAttended: boolean
  confirmedAt: number | null
  contributionPoints: number | null
  payoutAmount: number | null
  settlementComplete: boolean | null
}

type CreateSiegeInput = {
  eventDate: string
  startTime: string
  endTime: string
  memo?: string
}

type SiegeContextValue = {
  sieges: SiegeEvent[]
  rosterTotal: number
  getSiege: (siegeId: string) => SiegeEvent | undefined
  getSiegeByDate: (eventDate: string) => SiegeEvent | undefined
  getThisWeekSiege: () => SiegeEvent | undefined
  getActiveSurveySiege: () => SiegeEvent | null
  getMemberSurveyStatus: (siegeId: string, memberId: string) => MemberSurveyStatus
  needsSurveyResponse: (siegeId: string, memberId: string) => boolean
  getSurveyStats: (siegeId: string) => SiegeSurveyStats
  isActuallyConfirmed: (siegeId: string, memberId: string) => boolean
  getMemberSiegeContributionTotal: (memberId: string) => number
  getMemberSiegeContributionRecords: (memberId: string) => SiegeContributionRecord[]
  getMemberSiegeSessionRecords: (
    memberId: string,
    getPayout?: (siegeId: string, memberId: string) => {
      amount: number
      complete: boolean
    } | null,
  ) => SiegeSessionRecord[]
  createSiege: (input: CreateSiegeInput) => Promise<{ ok: boolean; message: string }>
  startSurvey: (siegeId: string) => Promise<{ ok: boolean; message: string }>
  closeSurvey: (siegeId: string) => Promise<{ ok: boolean; message: string }>
  submitSurveyResponse: (
    siegeId: string,
    response: SurveyResponse,
  ) => Promise<{ ok: boolean; message: string }>
  adminUpdateSurveyResponse: (
    siegeId: string,
    member: RosterMember,
    response: SurveyResponse,
    memo: string,
  ) => void
  startAttendanceConfirmation: (siegeId: string) => Promise<{ ok: boolean; message: string }>
  finalizeAttendance: (siegeId: string) => Promise<{ ok: boolean; message: string }>
  confirmAttendee: (siegeId: string, member: RosterMember) => void
  excludeAttendee: (
    siegeId: string,
    member: RosterMember,
    memo: string,
  ) => Promise<{ ok: boolean; message: string; attendees?: SiegeConfirmedAttendee[] }>
  addAttendeeManual: (
    siegeId: string,
    member: RosterMember,
    memo: string,
  ) => Promise<{ ok: boolean; message: string; attendees?: SiegeConfirmedAttendee[] }>
  linkSettlement: (siegeId: string, settlementKey: string) => void
  getSiegeFinancialFlags: (siegeId: string) => SiegeFinancialFlags
  closeSiegeWithNoIncome: (siegeId: string) => Promise<{ ok: boolean; message: string }>
  declareSiegeIncome: (siegeId: string) => Promise<{ ok: boolean; message: string }>
}

const SiegeContext = createContext<SiegeContextValue | null>(null)

const DEFAULT_START = "20:00"
const DEFAULT_END = "21:00"

const MOCK_ADMIN_ID = "admin-001"

const CONTRIBUTION_ELIGIBLE: SiegeStatus[] = [
  "attendance_confirmed",
  "settling",
  "completed",
]

function appendAttendanceChangeLog(
  logs: SiegeAttendanceChangeLog[],
  entry: Omit<SiegeAttendanceChangeLog, "id" | "changedAt">,
): SiegeAttendanceChangeLog[] {
  return [
    ...logs,
    {
      ...entry,
      id: `siege-chg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      changedAt: Date.now(),
    },
  ]
}

function appendAdminLog(
  logs: SiegeAdminLog[],
  entry: Omit<SiegeAdminLog, "id" | "at">,
): SiegeAdminLog[] {
  return [
    ...logs,
    {
      ...entry,
      id: `siege-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
    },
  ]
}

function createEmptySiege(eventDate: string, memo = ""): SiegeEvent {
  return {
    id: makeSiegeId(eventDate),
    eventDate,
    startTime: DEFAULT_START,
    endTime: DEFAULT_END,
    status: "draft",
    memo,
    settlementId: null,
    surveyResponses: [],
    surveyOpenedAt: null,
    surveyClosedAt: null,
    confirmedAttendees: [],
    attendanceConfirmedAt: null,
    manualAdjustments: [],
    attendanceChangeLogs: [],
    financialFlags: { ...DEFAULT_SIEGE_FINANCIAL_FLAGS },
  }
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + (m || 0)
}

function canEditAttendance(status: SiegeStatus): boolean {
  return (
    status === "attendance_confirming" ||
    status === "attendance_confirmed" ||
    status === "settling"
  )
}

export function SiegeProvider({ children }: { children: ReactNode }) {
  const { getActiveMembers } = useMembers()
  const currentMemberId = useCurrentMemberId()
  const [sieges, setSieges] = useState<SiegeEvent[]>([])

  const siegesRef = useRef(sieges)
  siegesRef.current = sieges

  const refreshSiegeData = useCallback(async (): Promise<SiegeEvent[]> => {
    const result = await fetchSiegeEvents()
    if (result.ok && result.sieges) {
      setSieges(result.sieges)
      return result.sieges
    }
    return siegesRef.current
  }, [])

  useEffect(() => {
    void refreshSiegeData()
  }, [refreshSiegeData])

  const rosterTotal = getActiveMembers().length

  const getSiege = useCallback(
    (siegeId: string) => sieges.find((s) => s.id === siegeId),
    [sieges],
  )

  const getSiegeByDate = useCallback(
    (eventDate: string) => sieges.find((s) => s.eventDate === eventDate),
    [sieges],
  )

  const getThisWeekSiege = useCallback(() => {
    const sunday = getThisWeekSunday()
    return sieges.find((s) => s.eventDate === sunday)
  }, [sieges])

  const getActiveSurveySiege = useCallback(() => {
    return sieges.find((s) => s.status === "survey_open") ?? null
  }, [sieges])

  const getMemberSurveyStatus = useCallback(
    (siegeId: string, memberId: string): MemberSurveyStatus => {
      const siege = sieges.find((s) => s.id === siegeId)
      if (!siege) return "미응답"
      const entry = siege.surveyResponses.find((r) => r.memberId === memberId)
      return entry?.response ?? "미응답"
    },
    [sieges],
  )

  const needsSurveyResponse = useCallback(
    (siegeId: string, memberId: string) => {
      const siege = sieges.find((s) => s.id === siegeId)
      if (!siege || siege.status !== "survey_open") return false
      return getMemberSurveyStatus(siegeId, memberId) === "미응답"
    },
    [sieges, getMemberSurveyStatus],
  )

  const getSurveyStats = useCallback(
    (siegeId: string): SiegeSurveyStats => {
      const siege = sieges.find((s) => s.id === siegeId)
      if (!siege) {
        return { total: rosterTotal, intended: 0, declined: 0, noResponse: rosterTotal }
      }
      const intended = siege.surveyResponses.filter((r) => r.response === "참여 예정").length
      const declined = siege.surveyResponses.filter((r) => r.response === "불참 예정").length
      return {
        total: rosterTotal,
        intended,
        declined,
        noResponse: rosterTotal - siege.surveyResponses.length,
      }
    },
    [sieges],
  )

  const isActuallyConfirmed = useCallback(
    (siegeId: string, memberId: string) => {
      const siege = sieges.find((s) => s.id === siegeId)
      if (!siege || !CONTRIBUTION_ELIGIBLE.includes(siege.status)) return false
      return siege.confirmedAttendees.some((a) => a.memberId === memberId)
    },
    [sieges],
  )

  const getMemberSiegeContributionRecords = useCallback(
    (memberId: string): SiegeContributionRecord[] => {
      return sieges
        .filter(
          (s) =>
            CONTRIBUTION_ELIGIBLE.includes(s.status) &&
            s.confirmedAttendees.some((a) => a.memberId === memberId),
        )
        .map((s) => ({
          siegeId: s.id,
          eventDate: s.eventDate,
          timeRange: formatSiegeTimeRange(s.startTime, s.endTime),
          points: SIEGE_CONTRIBUTION_POINTS,
        }))
    },
    [sieges],
  )

  const getMemberSiegeContributionTotal = useCallback(
    (memberId: string) => {
      return getMemberSiegeContributionRecords(memberId).reduce((sum, r) => sum + r.points, 0)
    },
    [getMemberSiegeContributionRecords],
  )

  const getMemberSiegeSessionRecords = useCallback(
    (
      memberId: string,
      getPayout?: (siegeId: string, memberId: string) => {
        amount: number
        complete: boolean
      } | null,
    ): SiegeSessionRecord[] => {
      return sieges
        .filter((s) => s.status !== "draft")
        .map((s) => {
          const surveyStatus = getMemberSurveyStatus(s.id, memberId)
          const confirmed = s.confirmedAttendees.find((a) => a.memberId === memberId)
          const actuallyAttended =
            CONTRIBUTION_ELIGIBLE.includes(s.status) && !!confirmed
          const payout = getPayout?.(s.id, memberId) ?? null
          return {
            id: `siege-session-${s.id}-${memberId}`,
            siegeId: s.id,
            eventDate: s.eventDate,
            startTime: s.startTime,
            endTime: s.endTime,
            surveyStatus,
            actuallyAttended,
            confirmedAt: confirmed?.confirmedAt ?? null,
            contributionPoints: actuallyAttended ? SIEGE_CONTRIBUTION_POINTS : null,
            payoutAmount: payout?.amount ?? null,
            settlementComplete: payout ? payout.complete : null,
          }
        })
        .reverse()
    },
    [sieges, getMemberSurveyStatus],
  )

  const createSiege = useCallback(
    async (input: CreateSiegeInput): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({
        action: "create",
        eventDate: input.eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        memo: input.memo ?? "",
      })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const startSurvey = useCallback(
    async (siegeId: string): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({ action: "start_survey", siegeId })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const closeSurvey = useCallback(
    async (siegeId: string): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({ action: "close_survey", siegeId })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const submitSurveyResponse = useCallback(
    async (siegeId: string, response: SurveyResponse): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({
        action: "submit_survey",
        siegeId,
        response,
      })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const adminUpdateSurveyResponse = useCallback(
    (siegeId: string, member: RosterMember, response: SurveyResponse, memo: string) => {
      void (async () => {
        await siegeApi.mutate({
          action: "admin_survey_update",
          siegeId,
          memberId: member.id,
          response,
          memo,
        })
        await refreshSiegeData()
      })()
    },
    [refreshSiegeData],
  )

  const startAttendanceConfirmation = useCallback(
    async (siegeId: string): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({ action: "start_attendance", siegeId })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const finalizeAttendance = useCallback(
    async (siegeId: string): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({ action: "finalize_attendance", siegeId })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const confirmAttendee = useCallback(
    (siegeId: string, member: RosterMember) => {
      void (async () => {
        await siegeApi.mutate({
          action: "confirm_attendee",
          siegeId,
          memberId: member.id,
        })
        await refreshSiegeData()
      })()
    },
    [refreshSiegeData],
  )

  const excludeAttendee = useCallback(
    async (
      siegeId: string,
      member: RosterMember,
      memo: string,
    ): Promise<{ ok: boolean; message: string; attendees?: SiegeConfirmedAttendee[] }> => {
      const result = await siegeApi.mutate({
        action: "remove_participant",
        siegeId,
        memberId: member.id,
        memo,
      })
      if (result.ok) {
        const updated = await refreshSiegeData()
        const siege = updated.find((s) => s.id === siegeId)
        return { ...result, attendees: siege?.confirmedAttendees }
      }
      return result
    },
    [refreshSiegeData],
  )

  const addAttendeeManual = useCallback(
    async (
      siegeId: string,
      member: RosterMember,
      memo: string,
    ): Promise<{ ok: boolean; message: string; attendees?: SiegeConfirmedAttendee[] }> => {
      const result = await siegeApi.mutate({
        action: "add_participant",
        siegeId,
        memberId: member.id,
        memo,
      })
      if (result.ok) {
        const updated = await refreshSiegeData()
        const siege = updated.find((s) => s.id === siegeId)
        return { ...result, attendees: siege?.confirmedAttendees }
      }
      return result
    },
    [refreshSiegeData],
  )

  const linkSettlement = useCallback(
    (siegeId: string, settlementKey: string) => {
      void (async () => {
        await siegeApi.mutate({
          action: "link_settlement",
          siegeId,
          settlementKey,
        })
        await refreshSiegeData()
      })()
    },
    [refreshSiegeData],
  )

  const getSiegeFinancialFlags = useCallback(
    (siegeId: string): SiegeFinancialFlags => {
      const siege = siegesRef.current.find((s) => s.id === siegeId)
      return siege?.financialFlags ?? DEFAULT_SIEGE_FINANCIAL_FLAGS
    },
    [],
  )

  const closeSiegeWithNoIncome = useCallback(
    async (siegeId: string): Promise<{ ok: boolean; message: string }> => {
      const siege = siegesRef.current.find((s) => s.id === siegeId)
      if (!siege) return { ok: false, message: "공성을 찾을 수 없습니다." }
      if (siege.settlementId) {
        return { ok: false, message: "정산이 등록된 공성은 수익 없음으로 마감할 수 없습니다." }
      }
      const result = await siegeApi.mutate({ action: "no_income", siegeId })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const declareSiegeIncome = useCallback(
    async (siegeId: string): Promise<{ ok: boolean; message: string }> => {
      const result = await siegeApi.mutate({ action: "declare_income", siegeId })
      if (result.ok) await refreshSiegeData()
      return result
    },
    [refreshSiegeData],
  )

  const value = useMemo<SiegeContextValue>(
    () => ({
      sieges,
      rosterTotal,
      getSiege,
      getSiegeByDate,
      getThisWeekSiege,
      getActiveSurveySiege,
      getMemberSurveyStatus,
      needsSurveyResponse,
      getSurveyStats,
      isActuallyConfirmed,
      getMemberSiegeContributionTotal,
      getMemberSiegeContributionRecords,
      getMemberSiegeSessionRecords,
      createSiege,
      startSurvey,
      closeSurvey,
      submitSurveyResponse,
      adminUpdateSurveyResponse,
      startAttendanceConfirmation,
      finalizeAttendance,
      confirmAttendee,
      excludeAttendee,
      addAttendeeManual,
      linkSettlement,
      getSiegeFinancialFlags,
      closeSiegeWithNoIncome,
      declareSiegeIncome,
    }),
    [
      sieges,
      rosterTotal,
      getSiege,
      getSiegeByDate,
      getThisWeekSiege,
      getActiveSurveySiege,
      getMemberSurveyStatus,
      needsSurveyResponse,
      getSurveyStats,
      isActuallyConfirmed,
      getMemberSiegeContributionTotal,
      getMemberSiegeContributionRecords,
      getMemberSiegeSessionRecords,
      createSiege,
      startSurvey,
      closeSurvey,
      submitSurveyResponse,
      adminUpdateSurveyResponse,
      startAttendanceConfirmation,
      finalizeAttendance,
      confirmAttendee,
      excludeAttendee,
      addAttendeeManual,
      linkSettlement,
      getSiegeFinancialFlags,
      closeSiegeWithNoIncome,
      declareSiegeIncome,
    ],
  )

  return <SiegeContext.Provider value={value}>{children}</SiegeContext.Provider>
}

export function useSiege() {
  const ctx = useContext(SiegeContext)
  if (!ctx) throw new Error("useSiege must be used within SiegeProvider")
  return ctx
}

export function useSiegeRoster(): RosterMember[] {
  return useMembers().getRosterMembers()
}

export function getSiegeStatusLabel(status: SiegeStatus): string {
  const labels: Record<SiegeStatus, string> = {
    draft: "생성됨",
    survey_open: "참여조사 진행 중",
    survey_closed: "참여조사 마감",
    attendance_confirming: "실제 참여 확정 중",
    attendance_confirmed: "참여 확정 완료",
    settling: "정산 진행 중",
    completed: "완료",
  }
  return labels[status]
}

export { makeSettlementKey, SIEGE_CONTRIBUTION_POINTS }
