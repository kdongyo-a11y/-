export type SettlementRevenueItem = {
  id: string
  guildId: string
  settlementId: string
  description: string
  quantity: number | null
  unitPrice: number | null
  amount: number
  memo: string
  sortOrder: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export type SettlementRevenueItemRow = {
  id: string
  guild_id: string
  settlement_id: string
  description: string
  quantity: number | string | null
  unit_price: number | null
  amount: number
  memo: string
  sort_order: number
  created_by: string | null
  created_at: string
  updated_at: string
}

/** 정산 생성 시 optional payload */
export type SettlementRevenueItemInput = {
  description: string
  quantity?: number | null
  unitPrice?: number | null
  amount: number
  memo?: string
}

export type SettlementRevenueItemUpdateInput = {
  id: string
  description?: string
  quantity?: number | null
  unitPrice?: number | null
  amount?: number
  memo?: string
}
