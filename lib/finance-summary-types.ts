import type { GuildCashCheckpoint } from "@/lib/guild-cash-types"
import type { SettlementRevenueItem } from "@/lib/settlement-revenue-item-types"
import type { SettlementRevenueReceipt } from "@/lib/settlement-revenue-receipt-types"

export type FinanceWorkItemKind =
  | "revenue_receivable"
  | "dues_receivable"
  | "return_receivable"
  | "participant_payable"
  | "management_payable"
  | "additional_payable"

export type FinanceWorkQueueSort = "remaining_desc" | "newest" | "oldest" | "kind"

export type FinanceWorkItem = {
  id: string
  kind: FinanceWorkItemKind
  occurredAt: string
  totalAmount: number
  remainingAmount: number
  statusLabel: string
  title: string
  subtitle: string
  description: string
  settlementDbId?: string
  sourceType?: "boss" | "siege"
  sourceId?: string
  memberId?: string
  billId?: string
  duesMonth?: string
}

export type SettlementRevenueDetail = {
  settlementDbId: string
  sourceType: "boss" | "siege"
  sourceId: string
  displayTitle: string
  displaySub: string
  occurredAt: string
  totalIncome: number
  receivedAmount: number
  receivableAmount: number
  items: SettlementRevenueItem[]
  receipts: SettlementRevenueReceipt[]
}

/** @deprecated use receivableQueue — kept for transition */
export type FinanceReceivableLine = {
  id: string
  label: string
  amount: number
  subLabel?: string
  sourceType?: "boss" | "siege"
  sourceId?: string
}

export type FinancePayableLine = {
  id: string
  label: string
  amount: number
  subLabel?: string
}

export type FinanceSummaryDrilldown = {
  duesReceivable: FinanceReceivableLine[]
  revenueReceivable: FinanceReceivableLine[]
  returnReceivable: FinanceReceivableLine[]
  participantPayable: FinancePayableLine[]
  additionalPayable: FinancePayableLine[]
  managementPayable: FinancePayableLine[]
}

export type FinanceSummary = {
  hasCheckpoint: boolean
  checkpoint: GuildCashCheckpoint | null
  cashBalance: number
  receivables: number
  payables: number
  availableFund: number
  projectedAvailableFund: number
  legacyGuildFund: number
  roundingRemainder: number
  receivableBreakdown: {
    dues: number
    revenue: number
    return: number
  }
  payableBreakdown: {
    participant: number
    additional: number
    management: number
  }
  receivableQueue: FinanceWorkItem[]
  payableQueue: FinanceWorkItem[]
  revenueDetails: Record<string, SettlementRevenueDetail>
  drilldown: FinanceSummaryDrilldown
  payablesExceedCash: boolean
}

export type FinanceSummarySettlementInput = {
  settlementDbId: string
  sourceType: "boss" | "siege"
  sourceId: string
  createdAtIso: string
  displayTitle: string
  displaySub: string
  totalIncome: number
  receivedAmount: number
  revenueItems: SettlementRevenueItem[]
  receipts: SettlementRevenueReceipt[]
  participants: Array<{
    memberId: string
    name: string
    payoutAmount: number
    paidAmount: number
    adminPaid: boolean
    adjustmentType: "none" | "return" | "additional" | "new_payout"
    returnAmount: number
    memberReturnConfirmed: boolean
    adminReturnConfirmed: boolean
    additionalAmount: number
    additionalAdminPaid: boolean
  }>
  managementPayments: Array<{
    memberId: string
    snapshotNickname: string
    amount: number
    adminPaid: boolean
  }>
}

export type FinanceSummaryDuesInput = {
  billId: string
  duesMonth: string
  createdAtIso: string
  memberId: string
  memberName: string
  amount: number
  status: "unpaid" | "payment_reported" | "paid"
}
