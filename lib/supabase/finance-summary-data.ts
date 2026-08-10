import type { SupabaseClient } from "@supabase/supabase-js"
import type { LedgerEntry } from "@/components/guild-ledger-context"
import type { FinanceSummary } from "@/lib/finance-summary-types"
import {
  computeFinanceSummary,
  receivedAmountForSettlement,
} from "@/lib/finance-summary-utils"
import type { GuildFundLedgerEntry } from "@/lib/guild-fund-utils"
import {
  fetchFinanceOperationalData,
  type DueMemberRow,
  type DuesRow,
} from "@/lib/supabase/finance-data"
import {
  fetchGuildCashCheckpoints,
  fetchGuildCashMovements,
  fetchLatestGuildCashCheckpoint,
} from "@/lib/supabase/guild-cash-data"
import type { SettlementMemberRow, SettlementRow } from "@/lib/supabase/settlement-mapper"
import { fetchSettlementRevenueReceipts } from "@/lib/supabase/settlement-revenue-receipt-data"

function ledgerEntryToGuildFundEntry(e: LedgerEntry): GuildFundLedgerEntry {
  return {
    date: e.date,
    type: e.type,
    amount: e.amount,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    cancelled: e.cancelled,
  }
}

export async function fetchFinanceSummaryForGuild(
  supabase: SupabaseClient,
  guildId: string,
): Promise<FinanceSummary> {
  const [
    financeData,
    settingsRes,
    movements,
    receipts,
    settlementsRes,
    mgmtRes,
    duesRes,
    memberNamesRes,
  ] = await Promise.all([
    fetchFinanceOperationalData(supabase),
    supabase.from("guild_finance_settings").select("rounding_remainder_balance").maybeSingle(),
    fetchGuildCashMovements(supabase, guildId),
    fetchSettlementRevenueReceipts(supabase, guildId),
    supabase.from("settlements").select("*").eq("guild_id", guildId),
    supabase.from("settlement_management_payments").select("*").eq("guild_id", guildId),
    supabase.from("dues").select("*").eq("guild_id", guildId),
    supabase.from("members").select("id, nickname").eq("guild_id", guildId),
  ])

  if (settlementsRes.error) throw settlementsRes.error
  if (mgmtRes.error) throw mgmtRes.error
  if (duesRes.error) throw duesRes.error
  if (memberNamesRes.error) throw memberNamesRes.error
  if (settingsRes.error) throw settingsRes.error

  const settlementRows = (settlementsRes.data ?? []) as SettlementRow[]
  const settlementIdList = settlementRows.map((s) => s.id)
  const settlementIds = new Set(settlementIdList)

  const [settlementMembersRes, dueMembersRes] = await Promise.all([
    settlementIdList.length > 0
      ? supabase.from("settlement_members").select("*").in("settlement_id", settlementIdList)
      : Promise.resolve({ data: [], error: null }),
    (duesRes.data ?? []).length > 0
      ? supabase
          .from("due_members")
          .select("*")
          .in("due_id", (duesRes.data as DuesRow[]).map((d) => d.id))
      : Promise.resolve({ data: [], error: null }),
  ])

  if (settlementMembersRes.error) throw settlementMembersRes.error
  if (dueMembersRes.error) throw dueMembersRes.error
  const membersBySettlement = new Map<string, SettlementMemberRow[]>()
  for (const m of (settlementMembersRes.data ?? []) as SettlementMemberRow[]) {
    if (!settlementIds.has(m.settlement_id)) continue
    const list = membersBySettlement.get(m.settlement_id) ?? []
    list.push(m)
    membersBySettlement.set(m.settlement_id, list)
  }

  const mgmtBySettlement = new Map<
    string,
    Array<{ member_id: string; snapshot_nickname: string; amount: number; admin_paid: boolean }>
  >()
  for (const mp of mgmtRes.data ?? []) {
    const row = mp as {
      settlement_id: string
      member_id: string
      snapshot_nickname: string
      amount: number
      admin_paid: boolean
    }
    if (!settlementIds.has(row.settlement_id)) continue
    const list = mgmtBySettlement.get(row.settlement_id) ?? []
    list.push(row)
    mgmtBySettlement.set(row.settlement_id, list)
  }

  const memberNames = new Map(
    (memberNamesRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const settlements = settlementRows.map((s) => {
    const memberRows = membersBySettlement.get(s.id) ?? []
    const mgmtRows = mgmtBySettlement.get(s.id) ?? []
    return {
      settlementDbId: s.id,
      sourceType: s.source_type,
      sourceId: s.source_id,
      createdAtIso: s.created_at,
      displayTitle: s.display_title,
      displaySub: s.display_sub,
      totalIncome: Number(s.total_income),
      receivedAmount: receivedAmountForSettlement(s.id, receipts),
      participants: memberRows.map((m) => ({
        memberId: m.member_id,
        name: memberNames.get(m.member_id) ?? "혈원",
        payoutAmount: Number(m.final_amount),
        paidAmount: Number(m.paid_amount),
        adminPaid: m.admin_paid,
        adjustmentType: m.adjustment_type,
        returnAmount: Number(m.return_amount),
        memberReturnConfirmed: m.member_return_confirmed,
        adminReturnConfirmed: m.admin_return_confirmed,
        additionalAmount: Number(m.additional_amount),
        additionalAdminPaid: m.additional_admin_paid,
      })),
      managementPayments: mgmtRows.map((mp) => ({
        memberId: mp.member_id,
        snapshotNickname: mp.snapshot_nickname,
        amount: Number(mp.amount),
        adminPaid: mp.admin_paid,
      })),
    }
  })

  const duesRows = (duesRes.data ?? []) as DuesRow[]
  const duesCreatedAt = new Map(duesRows.map((d) => [d.id, d.created_at]))
  const duesMonth = new Map(duesRows.map((d) => [d.id, d.dues_month]))

  const duesMembers = ((dueMembersRes.data ?? []) as DueMemberRow[])
    .filter((m) => duesCreatedAt.has(m.due_id))
    .map((m) => ({
      billId: m.due_id,
      duesMonth: duesMonth.get(m.due_id) ?? "",
      createdAtIso: duesCreatedAt.get(m.due_id) ?? m.created_at,
      memberId: m.member_id,
      memberName: memberNames.get(m.member_id) ?? "혈원",
      amount: Number(m.amount),
      status: m.status,
    }))

  const checkpoint = await fetchLatestGuildCashCheckpoint(supabase, guildId)
  const ledgerEntries = (financeData.entries ?? []).map(ledgerEntryToGuildFundEntry)

  const roundingRemainder = Number(
    (settingsRes.data as { rounding_remainder_balance?: number } | null)?.rounding_remainder_balance ?? 0,
  )

  return computeFinanceSummary({
    checkpoint,
    movements,
    settlements,
    duesMembers,
    openingBalance: financeData.openingBalance ?? 0,
    ledgerEntries,
    roundingRemainder,
  })
}

export async function listGuildCashCheckpointsForAdmin(
  supabase: SupabaseClient,
  guildId: string,
) {
  return fetchGuildCashCheckpoints(supabase, guildId)
}
