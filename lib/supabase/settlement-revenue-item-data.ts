import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  SettlementRevenueItem,
  SettlementRevenueItemInput,
  SettlementRevenueItemRow,
  SettlementRevenueItemUpdateInput,
} from "@/lib/settlement-revenue-item-types"
import {
  applyRevenueItemMetadataUpdates,
  validateRevenueItemsForTotalIncome,
} from "@/lib/settlement-revenue-item-utils"
import { mapFinanceRevenueRpcError } from "@/lib/settlement-revenue-item-rpc-errors"

function mapRow(row: SettlementRevenueItemRow): SettlementRevenueItem {
  return {
    id: row.id,
    guildId: row.guild_id,
    settlementId: row.settlement_id,
    description: row.description,
    quantity: row.quantity == null ? null : Number(row.quantity),
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    amount: Number(row.amount),
    memo: row.memo,
    sortOrder: row.sort_order,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function itemsToRpcPayload(items: SettlementRevenueItemInput[]) {
  return items.map((item, index) => ({
    description: item.description.trim(),
    quantity: item.quantity ?? null,
    unit_price: item.unitPrice ?? null,
    amount: Math.round(item.amount),
    memo: item.memo?.trim() ?? "",
    sort_order: index,
  }))
}

function mapRpcError(error: unknown): { ok: false; message: string } {
  return { ok: false, message: mapFinanceRevenueRpcError(error) ?? "수익 항목 처리 중 오류가 발생했습니다." }
}

async function persistRevenueItemMetadataRows(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  items: SettlementRevenueItem[],
): Promise<void> {
  for (const item of items) {
    const { error } = await admin
      .from("settlement_revenue_items")
      .update({
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        memo: item.memo,
      })
      .eq("id", item.id)
      .eq("guild_id", guildId)
      .eq("settlement_id", settlementId)

    if (error) throw error
  }
}

export async function fetchSettlementRevenueItems(
  supabase: SupabaseClient,
  guildId: string,
): Promise<SettlementRevenueItem[]> {
  const { data, error } = await supabase
    .from("settlement_revenue_items")
    .select("*")
    .eq("guild_id", guildId)
    .order("sort_order", { ascending: true })

  if (error) throw error
  return ((data ?? []) as SettlementRevenueItemRow[]).map(mapRow)
}

export async function fetchSettlementRevenueItemsForSettlement(
  supabase: SupabaseClient,
  guildId: string,
  settlementId: string,
): Promise<SettlementRevenueItem[]> {
  const { data, error } = await supabase
    .from("settlement_revenue_items")
    .select("*")
    .eq("guild_id", guildId)
    .eq("settlement_id", settlementId)
    .order("sort_order", { ascending: true })

  if (error) throw error
  return ((data ?? []) as SettlementRevenueItemRow[]).map(mapRow)
}

export async function persistSettlementRevenueItemsOnCreate(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  actorId: string,
  totalIncome: number,
  items: SettlementRevenueItemInput[] | undefined,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!items || items.length === 0) return { ok: true }

  const validation = validateRevenueItemsForTotalIncome(totalIncome, items)
  if (!validation.ok) return validation

  const { error } = await admin.rpc("insert_settlement_revenue_items_batch", {
    p_guild_id: guildId,
    p_settlement_id: settlementId,
    p_actor_id: actorId,
    p_items: itemsToRpcPayload(items),
  })

  if (error) return mapRpcError(error)
  return { ok: true }
}

export async function updateSettlementRevenueItemsMetadata(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  updates: SettlementRevenueItemUpdateInput[],
): Promise<{ ok: true; items: SettlementRevenueItem[] } | { ok: false; message: string }> {
  const existing = await fetchSettlementRevenueItemsForSettlement(admin, guildId, settlementId)
  if (existing.length === 0) {
    return { ok: false, message: "수익 상세 항목이 없습니다." }
  }

  const applied = applyRevenueItemMetadataUpdates(existing, updates)
  if (!applied.ok) return applied

  await persistRevenueItemMetadataRows(admin, guildId, settlementId, applied.items)
  return { ok: true, items: applied.items }
}

export async function updateSettlementRevenueItemAmounts(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  _totalIncome: number,
  amountBatch: Array<{ id: string; amount: number }>,
): Promise<{ ok: true; items: SettlementRevenueItem[] } | { ok: false; message: string }> {
  const { data, error } = await admin.rpc("update_settlement_revenue_item_amounts", {
    p_guild_id: guildId,
    p_settlement_id: settlementId,
    p_amount_items: amountBatch.map((row) => ({
      id: row.id,
      amount: Math.round(row.amount),
    })),
  })

  if (error) return mapRpcError(error)

  return {
    ok: true,
    items: ((data ?? []) as SettlementRevenueItemRow[]).map(mapRow),
  }
}

/** @deprecated use updateSettlementRevenueItemsMetadata or updateSettlementRevenueItemAmounts */
export async function updateSettlementRevenueItems(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  totalIncome: number,
  updates: SettlementRevenueItemUpdateInput[],
): Promise<{ ok: true; items: SettlementRevenueItem[] } | { ok: false; message: string }> {
  const hasAmount = updates.some((u) => u.amount !== undefined)
  if (hasAmount) {
    const amountBatch = updates
      .filter((u) => u.amount !== undefined)
      .map((u) => ({ id: u.id, amount: u.amount! }))
    return updateSettlementRevenueItemAmounts(admin, guildId, settlementId, totalIncome, amountBatch)
  }
  return updateSettlementRevenueItemsMetadata(admin, guildId, settlementId, updates)
}
