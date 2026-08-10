export type SettlementRevenueReceipt = {
  id: string
  guildId: string
  settlementId: string
  amount: number
  receivedAt: string
  confirmedBy: string | null
  memo: string
  createdAt: string
}

export type SettlementRevenueReceiptRow = {
  id: string
  guild_id: string
  settlement_id: string
  amount: number
  received_at: string
  confirmed_by: string | null
  memo: string
  created_at: string
}

export const REVENUE_RECEIPT_CASH_SOURCE_TYPE = "settlement_revenue_receipt"
