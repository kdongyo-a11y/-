import type { SupabaseClient } from "@supabase/supabase-js"
import { getTodayDateString } from "@/lib/boss-time-slots"
import {
  MONEY_ROUNDING_UNIT,
  ROUNDING_CARRY_LEDGER_SOURCE_ID,
  applySubThousandCarryDelta,
} from "@/lib/money-utils"
import { upsertLedgerEntry } from "@/lib/supabase/finance-data"

export async function fetchRoundingRemainderBalance(
  admin: SupabaseClient,
  guildId: string,
): Promise<number> {
  const { data, error } = await admin
    .from("guild_finance_settings")
    .select("rounding_remainder_balance")
    .eq("guild_id", guildId)
    .maybeSingle()

  if (error) {
    console.error("[fetchRoundingRemainderBalance]", error)
    return 0
  }

  return Number(data?.rounding_remainder_balance ?? 0)
}

export async function fetchRoundingCarryFlushLedgerTotal(
  admin: SupabaseClient,
  guildId: string,
): Promise<number> {
  const { data } = await admin
    .from("ledger_entries")
    .select("amount")
    .eq("guild_id", guildId)
    .eq("source_type", "manual")
    .eq("source_id", ROUNDING_CARRY_LEDGER_SOURCE_ID)
    .eq("entry_type", "income")
    .eq("cancelled", false)
    .maybeSingle()

  return Number(data?.amount ?? 0)
}

async function updateRoundingRemainderBalance(
  admin: SupabaseClient,
  guildId: string,
  balance: number,
): Promise<void> {
  const { error } = await admin
    .from("guild_finance_settings")
    .update({
      rounding_remainder_balance: balance,
      updated_at: new Date().toISOString(),
    })
    .eq("guild_id", guildId)

  if (error) {
    console.error("[updateRoundingRemainderBalance]", error)
    throw new Error("짜투리 잔액 저장에 실패했습니다.")
  }
}

async function setRoundingCarryFlushLedgerTotal(
  admin: SupabaseClient,
  guildId: string,
  totalAmount: number,
): Promise<void> {
  if (totalAmount <= 0) {
    const { data: existing } = await admin
      .from("ledger_entries")
      .select("id")
      .eq("guild_id", guildId)
      .eq("source_type", "manual")
      .eq("source_id", ROUNDING_CARRY_LEDGER_SOURCE_ID)
      .eq("entry_type", "income")
      .maybeSingle()

    if (existing?.id) {
      await admin
        .from("ledger_entries")
        .update({ cancelled: true, amount: 0 })
        .eq("id", existing.id)
    }
    return
  }

  await upsertLedgerEntry(admin, guildId, {
    transactionDate: getTodayDateString(),
    entryType: "income",
    sourceType: "manual",
    sourceId: ROUNDING_CARRY_LEDGER_SOURCE_ID,
    amount: totalAmount,
    description: `정산 짜투리 귀속 누적 ${totalAmount.toLocaleString("ko-KR")}원`,
  })
}

export type PostGuildShareRoundingResult = {
  ledgerAmount: number
  carryBalance: number
  flushDelta: number
  reverseDelta: number
  flushLedgerTotal: number
}

/**
 * settlement thousand-part ledger + sub-thousand carry pool (reversible flush).
 */
export async function applyGuildShareRoundingAndLedger(
  admin: SupabaseClient,
  guildId: string,
  params: {
    settlementLedgerSourceType: string
    settlementLedgerSourceId: string
    label: string
    prevSubThousand: number
    nextSubThousand: number
    guildShareLedgerAmount: number
  },
): Promise<PostGuildShareRoundingResult> {
  const currentCarry = await fetchRoundingRemainderBalance(admin, guildId)
  const currentFlushTotal = await fetchRoundingCarryFlushLedgerTotal(admin, guildId)

  const reconciled = applySubThousandCarryDelta(
    currentCarry,
    currentFlushTotal,
    params.prevSubThousand,
    params.nextSubThousand,
  )

  await updateRoundingRemainderBalance(admin, guildId, reconciled.carry)

  if (reconciled.flushLedgerTotal !== currentFlushTotal) {
    await setRoundingCarryFlushLedgerTotal(admin, guildId, reconciled.flushLedgerTotal)
  }

  if (params.guildShareLedgerAmount > 0) {
    await upsertLedgerEntry(admin, guildId, {
      transactionDate: getTodayDateString(),
      entryType: "income",
      sourceType: params.settlementLedgerSourceType,
      sourceId: params.settlementLedgerSourceId,
      amount: params.guildShareLedgerAmount,
      description: `${params.label} 혈맹 귀속 ${params.guildShareLedgerAmount.toLocaleString("ko-KR")}원`,
    })
  }

  return {
    ledgerAmount: params.guildShareLedgerAmount,
    carryBalance: reconciled.carry,
    flushDelta: reconciled.flushDelta,
    reverseDelta: reconciled.reverseDelta,
    flushLedgerTotal: reconciled.flushLedgerTotal,
  }
}

export { MONEY_ROUNDING_UNIT }
