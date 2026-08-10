"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useCurrentMemberId } from "@/components/auth-context"
import {
  isParticipantFullySettled,
  isSettlementComplete,
  getPaidAmount,
  getMemberReceiptPendingState,
  getMemberReceivedPayoutAmount,
  type AttendeeInput,
} from "@/lib/settlement-revision-utils"
import { useSiege } from "@/components/siege-context"
import { useGuildLedger } from "@/components/guild-ledger-context"
import { fetchSettlements, settlementApi } from "@/lib/operations-api"
import { getPendingManagementFeesForMember } from "@/lib/settlement-management-payment-utils"
import type { PendingManagementFeeItem } from "@/lib/settlement-management-payment-types"
import {
  makeSettlementKey,
  type Settlement,
  type SettlementParticipant,
  type SettlementModificationLog,
  type SettlementSummary,
  type SettlementSourceType,
  type PendingReceiptItem,
  type PendingReturnItem,
  type MemberSettlementItem,
} from "@/lib/settlement-types"

export type {
  Settlement,
  SettlementParticipant,
  SettlementModificationLog,
  SettlementSummary,
  SettlementSourceType,
  PendingReceiptItem,
  PendingReturnItem,
  MemberSettlementItem,
}

type SettlementContextValue = {
  settlements: Record<string, Settlement>
  getSettlement: (sourceType: SettlementSourceType, sourceId: string) => Settlement | null
  getBossSettlement: (slotId: string) => Settlement | null
  getSiegeSettlement: (siegeId: string) => Settlement | null
  getSettlementSummary: (sourceType: SettlementSourceType, sourceId: string) => SettlementSummary | null
  getMemberPayout: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => SettlementParticipant | null
  getMemberSettlements: (memberId: string) => MemberSettlementItem[]
  getMemberReceivedPayoutTotal: (memberId: string) => number
  getPendingReceipts: (memberId: string) => PendingReceiptItem[]
  getPendingManagementFees: (memberId: string) => PendingManagementFeeItem[]
  getPendingReturns: (memberId: string) => PendingReturnItem[]
  createBossSettlement: (
    slotId: string,
    totalRevenue: number,
    guildShareInput: number,
    managementFeeManualInput?: number,
    revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
  ) => Promise<{ ok: boolean; message: string }>
  createSiegeSettlement: (
    siegeId: string,
    totalRevenue: number,
    guildShareInput: number,
    memo?: string,
    managementFeeManualInput?: number,
    revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
  ) => Promise<{ ok: boolean; message: string }>
  createSettlement: (
    slotId: string,
    totalRevenue: number,
    guildShareInput: number,
    managementFeeManualInput?: number,
    revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
  ) => Promise<{ ok: boolean; message: string }>
  reviseSettlement: (
    sourceType: SettlementSourceType,
    sourceId: string,
    attendees: AttendeeInput[],
    reason: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmAdminPayment: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmAllAdminPayments: (
    sourceType: SettlementSourceType,
    sourceId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmMemberReceipt: (
    sourceType: SettlementSourceType,
    sourceId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmManagementMemberReceipt: (
    sourceType: SettlementSourceType,
    sourceId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmManagementAdminPayment: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  cancelManagementAdminPayment: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmMemberReturn: (
    sourceType: SettlementSourceType,
    sourceId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmAdminReturn: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmAdditionalAdminPayment: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => void
  cancelAdminReturnConfirmation: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  cancelAdminPaymentConfirmation: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  cancelAdditionalAdminPaymentConfirmation: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
  ) => Promise<{ ok: boolean; message: string }>
  confirmAdditionalMemberReceipt: (
    sourceType: SettlementSourceType,
    sourceId: string,
  ) => { ok: boolean; message: string }
  adminModifyStatus: (
    sourceType: SettlementSourceType,
    sourceId: string,
    memberId: string,
    field: "adminPaid" | "memberReceived",
    value: boolean,
    reason: string,
  ) => void
  getSiegeParticipantModifyGuard: (siegeId: string) => {
    allowed: boolean
    blockedReason: string | null
    needsRevision: boolean
  }
  recalculateSiegeSettlement: (
    siegeId: string,
    attendeesOverride?: Array<{ memberId: string; name: string }>,
  ) => Promise<{ ok: boolean; message: string }>
  isLoading: boolean
  loadError: string | null
  refreshSettlements: () => Promise<void>
}

const SettlementContext = createContext<SettlementContextValue | null>(null)

function buildSummary(participants: SettlementParticipant[]): SettlementSummary {
  let adminPaid = 0
  let memberReceived = 0
  let finalComplete = 0
  let returnPending = 0
  let additionalPending = 0

  for (const p of participants) {
    if (p.adminPaid) adminPaid++
    if (p.memberReceived) memberReceived++
    if (isParticipantFullySettled(p)) finalComplete++
    if (p.personalStatus === "return_required" || p.personalStatus === "return_in_progress") {
      returnPending++
    }
    if (
      p.personalStatus === "additional_required" ||
      p.personalStatus === "additional_awaiting_receipt"
    ) {
      additionalPending++
    }
  }

  const revisionInProgress = participants.some((p) =>
    [
      "return_required",
      "return_in_progress",
      "additional_required",
      "additional_awaiting_receipt",
    ].includes(p.personalStatus),
  )

  return {
    total: participants.length,
    adminPaid,
    memberReceived,
    finalComplete,
    unconfirmed: participants.length - finalComplete,
    returnPending,
    additionalPending,
    revisionInProgress,
  }
}

export function SettlementProvider({ children }: { children: ReactNode }) {
  const { getSiege } = useSiege()
  const { refreshFinance } = useGuildLedger()
  const currentMemberId = useCurrentMemberId()
  const [settlements, setSettlements] = useState<Record<string, Settlement>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshSettlements = useCallback(async () => {
    const result = await fetchSettlements()
    if (!result.ok) {
      setLoadError(result.message ?? "정산 기록을 불러오지 못했습니다.")
      return
    }
    setLoadError(null)
    setSettlements(result.settlements ?? {})
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      await refreshSettlements()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshSettlements])

  const getSettlement = useCallback(
    (sourceType: SettlementSourceType, sourceId: string) => {
      const key = makeSettlementKey(sourceType, sourceId)
      return settlements[key] ?? null
    },
    [settlements],
  )

  const getBossSettlement = useCallback(
    (slotId: string) => getSettlement("boss", slotId),
    [getSettlement],
  )

  const getSiegeSettlement = useCallback(
    (siegeId: string) => getSettlement("siege", siegeId),
    [getSettlement],
  )

  const getSettlementSummary = useCallback(
    (sourceType: SettlementSourceType, sourceId: string) => {
      const s = getSettlement(sourceType, sourceId)
      return s ? buildSummary(s.participants) : null
    },
    [getSettlement],
  )

  const getMemberPayout = useCallback(
    (sourceType: SettlementSourceType, sourceId: string, memberId: string) => {
      const s = getSettlement(sourceType, sourceId)
      return s?.participants.find((p) => p.memberId === memberId) ?? null
    },
    [getSettlement],
  )

  const getMemberSettlements = useCallback(
    (memberId: string): MemberSettlementItem[] => {
      return Object.values(settlements)
        .map((settlement) => {
          const participant = settlement.participants.find((p) => p.memberId === memberId)
          if (!participant) return null
          return {
            sourceType: settlement.sourceType,
            sourceId: settlement.sourceId,
            settlement,
            participant,
          }
        })
        .filter((x): x is MemberSettlementItem => x !== null)
        .sort((a, b) => b.settlement.createdAt - a.settlement.createdAt)
    },
    [settlements],
  )

  const getMemberReceivedPayoutTotal = useCallback(
    (memberId: string): number => {
      return Object.values(settlements).reduce((sum, settlement) => {
        const p = settlement.participants.find((x) => x.memberId === memberId)
        return sum + (p ? getMemberReceivedPayoutAmount(p) : 0)
      }, 0)
    },
    [settlements],
  )

  const getPendingReceipts = useCallback(
    (memberId: string): PendingReceiptItem[] => {
      return Object.entries(settlements)
        .flatMap(([key, settlement]) => {
          const participant = settlement.participants.find((p) => p.memberId === memberId)
          if (!participant) return []

          const pending = getMemberReceiptPendingState(participant)
          if (!pending) return []

          return [
            {
              key,
              sourceType: settlement.sourceType,
              sourceId: settlement.sourceId,
              displayTitle: settlement.displayTitle,
              displaySub: settlement.displaySub,
              confirmAmount: pending.confirmAmount,
              finalAmount: pending.finalAmount,
              basePaidAmount: pending.basePaidAmount,
              additionalAmount: pending.additionalAmount,
              baseConfirmed: pending.baseConfirmed,
              adminPaidCumulative: pending.adminPaidCumulative,
              memberConfirmedCumulative: pending.memberConfirmedCumulative,
              participant,
              kind: pending.kind,
              actionable: pending.actionable,
            },
          ]
        })
        .sort((a, b) => {
          const sa = settlements[a.key]?.createdAt ?? 0
          const sb = settlements[b.key]?.createdAt ?? 0
          return sb - sa
        })
    },
    [settlements],
  )

  const getPendingManagementFees = useCallback(
    (memberId: string): PendingManagementFeeItem[] => {
      return getPendingManagementFeesForMember(settlements, memberId)
    },
    [settlements],
  )

  const getPendingReturns = useCallback(
    (memberId: string): PendingReturnItem[] => {
      return Object.entries(settlements)
        .flatMap(([key, settlement]) => {
          const participant = settlement.participants.find((p) => p.memberId === memberId)
          if (!participant) return []
          if (
            participant.adjustmentType !== "return" ||
            participant.personalStatus === "return_completed"
          ) {
            return []
          }
          if (participant.memberReturnConfirmed && participant.adminReturnConfirmed) return []

          const previousPaidAmount = getPaidAmount(participant)
          return [
            {
              key,
              sourceType: settlement.sourceType,
              sourceId: settlement.sourceId,
              displayTitle: settlement.displayTitle,
              displaySub: settlement.displaySub,
              participant,
              previousPaidAmount,
              newPayoutAmount: participant.payoutAmount,
              returnAmount: participant.returnAmount,
            },
          ]
        })
        .sort((a, b) => {
          const sa = settlements[a.key]?.createdAt ?? 0
          const sb = settlements[b.key]?.createdAt ?? 0
          return sb - sa
        })
    },
    [settlements],
  )

  const afterSettlementMutation = useCallback(async () => {
    await refreshSettlements()
    await refreshFinance()
  }, [refreshSettlements, refreshFinance])

  const reviseSettlement = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      attendees: AttendeeInput[],
      reason: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.revise(sourceType, sourceId, attendees, reason)
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const createBossSettlement = useCallback(
    async (
      slotId: string,
      totalRevenue: number,
      guildShareInput: number,
      managementFeeManualInput = 0,
      revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.createBoss(
        slotId,
        totalRevenue,
        guildShareInput,
        managementFeeManualInput,
        revenueItems,
      )
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const createSiegeSettlement = useCallback(
    async (
      siegeId: string,
      totalRevenue: number,
      guildShareInput: number,
      memo = "",
      managementFeeManualInput = 0,
      revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.createSiege(
        siegeId,
        totalRevenue,
        guildShareInput,
        memo,
        managementFeeManualInput,
        revenueItems,
      )
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const createSettlement = createBossSettlement

  const confirmAdminPayment = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmAdminPayment(sourceType, sourceId, memberId)
      if (result.ok) await refreshSettlements()
      return result
    },
    [refreshSettlements],
  )

  const confirmAllAdminPayments = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmAllAdminPayments(sourceType, sourceId)
      if (result.ok) await refreshSettlements()
      return result
    },
    [refreshSettlements],
  )

  const confirmAdditionalAdminPayment = useCallback(
    (sourceType: SettlementSourceType, sourceId: string, memberId: string) => {
      void (async () => {
        await settlementApi.confirmAdditionalAdminPayment(sourceType, sourceId, memberId)
        await refreshSettlements()
      })()
    },
    [refreshSettlements],
  )

  const confirmMemberReceipt = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmMemberReceipt(sourceType, sourceId)
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const confirmManagementMemberReceipt = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmManagementMemberReceipt(sourceType, sourceId)
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const confirmManagementAdminPayment = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmManagementAdminPayment(sourceType, sourceId, memberId)
      if (result.ok) await refreshSettlements()
      return result
    },
    [refreshSettlements],
  )

  const cancelManagementAdminPayment = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.cancelManagementAdminPayment(sourceType, sourceId, memberId)
      if (result.ok) await refreshSettlements()
      return result
    },
    [refreshSettlements],
  )

  const confirmAdditionalMemberReceipt = confirmMemberReceipt

  const confirmMemberReturn = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmMemberReturn(sourceType, sourceId)
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const confirmAdminReturn = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.confirmAdminReturn(sourceType, sourceId, memberId)
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const cancelAdminReturnConfirmation = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.cancelAdminReturnConfirmation(sourceType, sourceId, memberId)
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const cancelAdminPaymentConfirmation = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.cancelAdminPaymentConfirmation(sourceType, sourceId, memberId)
      if (result.ok) await refreshSettlements()
      return result
    },
    [refreshSettlements],
  )

  const cancelAdditionalAdminPaymentConfirmation = useCallback(
    async (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await settlementApi.cancelAdditionalAdminPaymentConfirmation(
        sourceType,
        sourceId,
        memberId,
      )
      if (result.ok) await afterSettlementMutation()
      return result
    },
    [afterSettlementMutation],
  )

  const adminModifyStatus = useCallback(
    (
      sourceType: SettlementSourceType,
      sourceId: string,
      memberId: string,
      field: "adminPaid" | "memberReceived",
      value: boolean,
      reason: string,
    ) => {
      if (!reason.trim()) return
      void (async () => {
        await settlementApi.adminModifyStatus(sourceType, sourceId, memberId, field, value, reason)
        await refreshSettlements()
      })()
    },
    [refreshSettlements],
  )

  const getSiegeParticipantModifyGuard = useCallback(
    (siegeId: string) => {
      const settlement = getSiegeSettlement(siegeId)
      if (!settlement) {
        return { allowed: true, blockedReason: null, needsRevision: false }
      }
      return {
        allowed: true,
        blockedReason: null,
        needsRevision: true,
      }
    },
    [getSiegeSettlement],
  )

  const recalculateSiegeSettlement = useCallback(
    async (
      siegeId: string,
      attendeesOverride?: Array<{ memberId: string; name: string }>,
    ): Promise<{ ok: boolean; message: string }> => {
      const siege = getSiege(siegeId)
      if (!siege) return { ok: false, message: "공성을 찾을 수 없습니다." }
      const attendees =
        attendeesOverride ??
        siege.confirmedAttendees.map((a) => ({ memberId: a.memberId, name: a.name }))
      return reviseSettlement("siege", siegeId, attendees, "참여자 변경")
    },
    [getSiege, reviseSettlement],
  )

  const value = useMemo<SettlementContextValue>(
    () => ({
      settlements,
      getSettlement,
      getBossSettlement,
      getSiegeSettlement,
      getSettlementSummary,
      getMemberPayout,
      getMemberSettlements,
      getMemberReceivedPayoutTotal,
      getPendingReceipts,
      getPendingManagementFees,
      getPendingReturns,
      createBossSettlement,
      createSiegeSettlement,
      createSettlement,
      reviseSettlement,
      confirmAdminPayment,
      confirmAllAdminPayments,
      confirmMemberReceipt,
      confirmManagementMemberReceipt,
      confirmManagementAdminPayment,
      cancelManagementAdminPayment,
      confirmMemberReturn,
      confirmAdminReturn,
      cancelAdminReturnConfirmation,
      cancelAdminPaymentConfirmation,
      cancelAdditionalAdminPaymentConfirmation,
      confirmAdditionalAdminPayment,
      confirmAdditionalMemberReceipt,
      adminModifyStatus,
      getSiegeParticipantModifyGuard,
      recalculateSiegeSettlement,
      isLoading,
      loadError,
      refreshSettlements,
    }),
    [
      settlements,
      getSettlement,
      getBossSettlement,
      getSiegeSettlement,
      getSettlementSummary,
      getMemberPayout,
      getMemberSettlements,
      getMemberReceivedPayoutTotal,
      getPendingReceipts,
      getPendingManagementFees,
      getPendingReturns,
      createBossSettlement,
      createSiegeSettlement,
      createSettlement,
      reviseSettlement,
      confirmAdminPayment,
      confirmAllAdminPayments,
      confirmMemberReceipt,
      confirmManagementMemberReceipt,
      confirmManagementAdminPayment,
      cancelManagementAdminPayment,
      confirmMemberReturn,
      confirmAdminReturn,
      cancelAdminReturnConfirmation,
      cancelAdminPaymentConfirmation,
      cancelAdditionalAdminPaymentConfirmation,
      confirmAdditionalAdminPayment,
      confirmAdditionalMemberReceipt,
      adminModifyStatus,
      getSiegeParticipantModifyGuard,
      recalculateSiegeSettlement,
      isLoading,
      loadError,
      refreshSettlements,
    ],
  )

  return <SettlementContext.Provider value={value}>{children}</SettlementContext.Provider>
}

export function useSettlement() {
  const ctx = useContext(SettlementContext)
  if (!ctx) throw new Error("useSettlement must be used within SettlementProvider")
  return ctx
}

export { isSettlementComplete, isParticipantFullySettled }
