export type GuildCashCheckpoint = {
  id: string
  guildId: string
  effectiveAt: string
  openingCashBalance: number
  createdBy: string | null
  memo: string
  createdAt: string
}

export type GuildCashMovementDirection = "in" | "out"

export type GuildCashMovementCategory =
  | "revenue_received"
  | "dues_received"
  | "return_received"
  | "participant_paid"
  | "management_paid"
  | "period_paid"
  | "expense"
  | "manual_adjustment"

export type GuildCashMovement = {
  id: string
  guildId: string
  movementAt: string
  direction: GuildCashMovementDirection
  amount: number
  category: GuildCashMovementCategory
  sourceType: string
  sourceId: string
  description: string
  createdBy: string | null
  cancelled: boolean
  createdAt: string
}

export type GuildCashCheckpointRow = {
  id: string
  guild_id: string
  effective_at: string
  opening_cash_balance: number
  created_by: string | null
  memo: string
  created_at: string
}

export type GuildCashMovementRow = {
  id: string
  guild_id: string
  movement_at: string
  direction: GuildCashMovementDirection
  amount: number
  category: GuildCashMovementCategory
  source_type: string
  source_id: string
  description: string
  created_by: string | null
  cancelled: boolean
  created_at: string
}
