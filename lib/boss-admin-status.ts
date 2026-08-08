import type { SlotCheckStatus } from "@/components/participation-context"
import { isSettlementComplete } from "@/lib/settlement-utils"

export type BossProcessStatus =
  | "unprocessed"
  | "no_income_closed"
  | "income_pending"
  | "settlement_in_progress"
  | "completed"

export type SlotAdminFlags = {
  noIncomeClosed: boolean
  incomeDeclared: boolean
}

export const DEFAULT_SLOT_ADMIN_FLAGS: SlotAdminFlags = {
  noIncomeClosed: false,
  incomeDeclared: false,
}

export const BOSS_PROCESS_STATUS_LABELS: Record<BossProcessStatus, string> = {
  unprocessed: "미처리",
  no_income_closed: "수익 없음 · 처리완료",
  income_pending: "수익 등록 필요",
  settlement_in_progress: "정산 진행 중",
  completed: "처리완료",
}

export type BossProcessFilter =
  | "all"
  | "unprocessed"
  | "income_pending"
  | "settlement_in_progress"
  | "completed"

export const BOSS_PROCESS_FILTER_LABELS: Record<BossProcessFilter, string> = {
  all: "전체",
  unprocessed: "미처리",
  income_pending: "수익 등록 필요",
  settlement_in_progress: "정산 진행 중",
  completed: "처리완료",
}

type ComputeParams = {
  checkStatus: SlotCheckStatus
  flags: SlotAdminFlags
  hasSettlement: boolean
  settlementParticipants: Array<{ adminPaid: boolean; memberReceived: boolean }>
}

export function computeBossProcessStatus({
  checkStatus,
  flags,
  hasSettlement,
  settlementParticipants,
}: ComputeParams): BossProcessStatus {
  if (flags.noIncomeClosed) return "no_income_closed"

  if (checkStatus !== "closed") return "unprocessed"

  if (hasSettlement) {
    const allComplete =
      settlementParticipants.length > 0 &&
      settlementParticipants.every((p) => isSettlementComplete(p.adminPaid, p.memberReceived))
    return allComplete ? "completed" : "settlement_in_progress"
  }

  if (flags.incomeDeclared) return "income_pending"

  return "unprocessed"
}

export function matchesBossProcessFilter(
  status: BossProcessStatus,
  filter: BossProcessFilter,
): boolean {
  if (filter === "all") return true
  if (filter === "completed") {
    return status === "completed" || status === "no_income_closed"
  }
  return status === filter
}

export function summarizeBossStatuses(statuses: BossProcessStatus[]) {
  let unprocessed = 0
  let incomePending = 0
  let settlementInProgress = 0
  let completed = 0

  for (const s of statuses) {
    if (s === "unprocessed") unprocessed++
    else if (s === "income_pending") incomePending++
    else if (s === "settlement_in_progress") settlementInProgress++
    else completed++
  }

  return { unprocessed, incomePending, settlementInProgress, completed, total: statuses.length }
}
