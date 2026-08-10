import type { GuildCashCheckpoint } from "@/lib/guild-cash-types"

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
  drilldown: FinanceSummaryDrilldown
  /** payables > cashBalance */
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
