import type { SiegeStatus } from "@/components/siege-context"
import { isSettlementComplete } from "@/lib/settlement-utils"

export type SiegeFinancialStatus =
  | "pending"
  | "no_income_closed"
  | "income_pending"
  | "settling"
  | "completed"

export type SiegeFinancialFlags = {
  noIncomeClosed: boolean
  incomeDeclared: boolean
}

export const DEFAULT_SIEGE_FINANCIAL_FLAGS: SiegeFinancialFlags = {
  noIncomeClosed: false,
  incomeDeclared: false,
}

export const SIEGE_PARTICIPATION_LABELS: Partial<Record<SiegeStatus, string>> = {
  draft: "생성됨",
  survey_open: "참여조사 중",
  survey_closed: "참여조사 마감",
  attendance_confirming: "실제 참여 확정 중",
  attendance_confirmed: "참여확정",
  settling: "참여확정",
  completed: "참여확정",
}

export const SIEGE_FINANCIAL_LABELS: Record<SiegeFinancialStatus, string> = {
  pending: "미처리",
  no_income_closed: "수익없음 완료",
  income_pending: "수익 등록 필요",
  settling: "정산중",
  completed: "처리완료",
}

type ComputeFinancialParams = {
  flags: SiegeFinancialFlags
  attendanceReady: boolean
  hasSettlement: boolean
  settlementParticipants: Array<{ adminPaid: boolean; memberReceived: boolean }>
}

export function computeSiegeFinancialStatus({
  flags,
  attendanceReady,
  hasSettlement,
  settlementParticipants,
}: ComputeFinancialParams): SiegeFinancialStatus {
  if (!attendanceReady) return "pending"
  if (flags.noIncomeClosed) return "no_income_closed"
  if (hasSettlement) {
    const allComplete =
      settlementParticipants.length > 0 &&
      settlementParticipants.every((p) => isSettlementComplete(p.adminPaid, p.memberReceived))
    return allComplete ? "completed" : "settling"
  }
  if (flags.incomeDeclared) return "income_pending"
  return "pending"
}
