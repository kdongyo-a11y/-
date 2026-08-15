import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  GuildCashCheckpoint,
  GuildCashCheckpointRow,
  GuildCashMovement,
  GuildCashMovementRow,
} from "@/lib/guild-cash-types"

function mapCheckpointRow(row: GuildCashCheckpointRow): GuildCashCheckpoint {
  return {
    id: row.id,
    guildId: row.guild_id,
    effectiveAt: row.effective_at,
    openingCashBalance: Number(row.opening_cash_balance),
    createdBy: row.created_by,
    memo: row.memo,
    createdAt: row.created_at,
  }
}

function mapMovementRow(row: GuildCashMovementRow): GuildCashMovement {
  return {
    id: row.id,
    guildId: row.guild_id,
    movementAt: row.movement_at,
    direction: row.direction,
    amount: Number(row.amount),
    category: row.category,
    sourceType: row.source_type,
    sourceId: row.source_id,
    description: row.description,
    createdBy: row.created_by,
    cancelled: row.cancelled,
    createdAt: row.created_at,
  }
}

export async function fetchGuildCashCheckpoints(
  supabase: SupabaseClient,
  guildId: string,
): Promise<GuildCashCheckpoint[]> {
  const { data, error } = await supabase
    .from("guild_cash_checkpoints")
    .select("*")
    .eq("guild_id", guildId)
    .order("effective_at", { ascending: false })

  if (error) throw error
  return ((data ?? []) as GuildCashCheckpointRow[]).map(mapCheckpointRow)
}

export async function fetchLatestGuildCashCheckpoint(
  supabase: SupabaseClient,
  guildId: string,
  asOf: Date = new Date(),
): Promise<GuildCashCheckpoint | null> {
  const { data, error } = await supabase
    .from("guild_cash_checkpoints")
    .select("*")
    .eq("guild_id", guildId)
    .lte("effective_at", asOf.toISOString())
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapCheckpointRow(data as GuildCashCheckpointRow)
}

export async function fetchGuildCashMovements(
  supabase: SupabaseClient,
  guildId: string,
): Promise<GuildCashMovement[]> {
  const { data, error } = await supabase
    .from("guild_cash_movements")
    .select("*")
    .eq("guild_id", guildId)
    .order("movement_at", { ascending: true })

  if (error) throw error
  return ((data ?? []) as GuildCashMovementRow[]).map(mapMovementRow)
}

export async function createGuildCashCheckpoint(
  admin: SupabaseClient,
  guildId: string,
  actorId: string,
  input: { effectiveAt: string; openingCashBalance: number; memo: string },
): Promise<{ ok: true; checkpoint: GuildCashCheckpoint } | { ok: false; message: string }> {
  if (!Number.isFinite(input.openingCashBalance)) {
    return { ok: false, message: "기준 실보유액을 올바르게 입력해주세요." }
  }
  if (!input.effectiveAt.trim()) {
    return { ok: false, message: "기준 시점을 입력해주세요." }
  }

  const { data, error } = await admin
    .from("guild_cash_checkpoints")
    .insert({
      guild_id: guildId,
      effective_at: input.effectiveAt,
      opening_cash_balance: Math.round(input.openingCashBalance),
      created_by: actorId,
      memo: input.memo.trim(),
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "동일 기준 시점의 checkpoint가 이미 존재합니다." }
    }
    throw error
  }

  return { ok: true, checkpoint: mapCheckpointRow(data as GuildCashCheckpointRow) }
}

export async function insertGuildCashMovement(
  admin: SupabaseClient,
  row: {
    guildId: string
    movementAt: string
    direction: GuildCashMovement["direction"]
    amount: number
    category: GuildCashMovement["category"]
    sourceType: string
    sourceId: string
    description: string
    createdBy: string
  },
): Promise<GuildCashMovement> {
  const { data, error } = await admin
    .from("guild_cash_movements")
    .insert({
      guild_id: row.guildId,
      movement_at: row.movementAt,
      direction: row.direction,
      amount: row.amount,
      category: row.category,
      source_type: row.sourceType,
      source_id: row.sourceId,
      description: row.description,
      created_by: row.createdBy,
    })
    .select("*")
    .single()

  if (error) throw error
  return mapMovementRow(data as GuildCashMovementRow)
}
