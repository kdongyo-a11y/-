import type { SettlementSourceType } from "@/lib/settlement-types"

export type ManagementPaymentStatus = "pending" | "paid" | "confirmed"

export type SettlementManagementPayment = {
  id: string
  memberId: string
  snapshotNickname: string
  ratioBp: number
  amount: number
  adminPaid: boolean
  adminPaidAt: number | null
  adminPaidBy: string | null
  memberConfirmed: boolean
  memberConfirmedAt: number | null
  status: ManagementPaymentStatus
  memo: string | null
}

export type PendingManagementFeeItem = {
  key: string
  sourceType: SettlementSourceType
  sourceId: string
  displayTitle: string
  displaySub: string
  amount: number
  payment: SettlementManagementPayment
  actionable: boolean
  kind: "awaiting_admin" | "awaiting_receipt"
}

export const MANAGEMENT_PAYMENT_STATUS_LABELS: Record<ManagementPaymentStatus, string> = {
  pending: "지급 예정",
  paid: "지급 완료 · 수령 확인 대기",
  confirmed: "완료",
}
