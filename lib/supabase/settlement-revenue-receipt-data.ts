import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  SettlementRevenueReceipt,
  SettlementRevenueReceiptRow,
} from "@/lib/settlement-revenue-receipt-types"
import { REVENUE_RECEIPT_CASH_SOURCE_TYPE } from "@/lib/settlement-revenue-receipt-types"
import {
  sumRevenueReceipts,
  validateRevenueReceiptAmount,
} from "@/lib/settlement-revenue-receipt-utils"
import { insertGuildCashMovement } from "@/lib/supabase/guild-cash-data"

function mapReceiptRow(row: SettlementRevenueReceiptRow): SettlementRevenueReceipt {
  return {
    id: row.id,
    guildId: row.guild_id,
    settlementId: row.settlement_id,
    amount: Number(row.amount),
    receivedAt: row.received_at,
    confirmedBy: row.confirmed_by,
    memo: row.memo,
    createdAt: row.created_at,
  }
}

export async function fetchSettlementRevenueReceipts(
  supabase: SupabaseClient,
  guildId: string,
): Promise<SettlementRevenueReceipt[]> {
  const { data, error } = await supabase
    .from("settlement_revenue_receipts")
    .select("*")
    .eq("guild_id", guildId)
    .order("received_at", { ascending: true })

  if (error) throw error
  return ((data ?? []) as SettlementRevenueReceiptRow[]).map(mapReceiptRow)
}

export async function fetchSettlementRevenueReceiptsForSettlement(
  supabase: SupabaseClient,
  guildId: string,
  settlementId: string,
): Promise<SettlementRevenueReceipt[]> {
  const { data, error } = await supabase
    .from("settlement_revenue_receipts")
    .select("*")
    .eq("guild_id", guildId)
    .eq("settlement_id", settlementId)
    .order("received_at", { ascending: true })

  if (error) throw error
  return ((data ?? []) as SettlementRevenueReceiptRow[]).map(mapReceiptRow)
}

export async function sumConfirmedReceiptsForSettlement(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
): Promise<number> {
  const receipts = await fetchSettlementRevenueReceiptsForSettlement(admin, guildId, settlementId)
  return sumRevenueReceipts(receipts)
}

export async function confirmSettlementRevenueReceipt(
  admin: SupabaseClient,
  guildId: string,
  actorId: string,
  input: {
    settlementId: string
    amount: number
    receivedAt: string
    memo: string
    totalIncome: number
    displayTitle: string
  },
): Promise<{ ok: true; receipt: SettlementRevenueReceipt } | { ok: false; message: string }> {
  const existing = await fetchSettlementRevenueReceiptsForSettlement(
    admin,
    guildId,
    input.settlementId,
  )
  const validation = validateRevenueReceiptAmount(input.totalIncome, existing, input.amount)
  if (!validation.ok) return validation

  const { data: receiptRow, error: receiptError } = await admin
    .from("settlement_revenue_receipts")
    .insert({
      guild_id: guildId,
      settlement_id: input.settlementId,
      amount: Math.round(input.amount),
      received_at: input.receivedAt,
      confirmed_by: actorId,
      memo: input.memo.trim(),
    })
    .select("*")
    .single()

  if (receiptError) throw receiptError

  const receipt = mapReceiptRow(receiptRow as SettlementRevenueReceiptRow)

  try {
    await insertGuildCashMovement(admin, {
      guildId,
      movementAt: input.receivedAt,
      direction: "in",
      amount: receipt.amount,
      category: "revenue_received",
      sourceType: REVENUE_RECEIPT_CASH_SOURCE_TYPE,
      sourceId: receipt.id,
      description: `${input.displayTitle} 수익 입금 ${receipt.amount.toLocaleString("ko-KR")}원`,
      createdBy: actorId,
    })
  } catch (movementError) {
    await admin.from("settlement_revenue_receipts").delete().eq("id", receipt.id)
    throw movementError
  }

  return { ok: true, receipt }
}
