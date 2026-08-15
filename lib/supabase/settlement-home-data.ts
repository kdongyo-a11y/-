import type { SupabaseClient } from "@supabase/supabase-js"
import type { Settlement } from "@/lib/settlement-types"
import { makeSettlementKey } from "@/lib/settlement-types"
import {
  buildSettlementsFromRows,
  type SettlementMemberRow,
  type SettlementRow,
} from "@/lib/supabase/settlement-mapper"
import { fetchManagementPaymentsForSettlements } from "@/lib/supabase/settlement-management-payment-data"

const SETTLEMENT_HOME_HEADER_COLUMNS =
  "id,guild_id,source_type,source_id,total_income,guild_base_amount,distributable_amount,per_member_amount,remainder_amount,final_guild_amount,revision,status,memo,display_title,display_sub,created_at,updated_at"

const SETTLEMENT_MEMBER_COLUMNS =
  "id,settlement_id,member_id,final_amount,paid_amount,admin_paid,admin_paid_at,member_received,member_received_at,adjustment_amount,adjustment_type,return_amount,member_return_confirmed,member_return_confirmed_at,admin_return_confirmed,admin_return_confirmed_at,additional_amount,additional_admin_paid,additional_admin_paid_at,additional_member_received,additional_member_received_at,personal_status"

/** Member-scoped settlements for home pending/payout — no revisions/logs/snapshots. */
export async function fetchMemberSettlementHomeData(
  supabase: SupabaseClient,
  guildId: string,
  memberId: string,
): Promise<{ settlements: Record<string, Settlement> }> {
  const { data: memberRows, error: memberError } = await supabase
    .from("settlement_members")
    .select(SETTLEMENT_MEMBER_COLUMNS)
    .eq("member_id", memberId)

  if (memberError) throw memberError
  const rows = (memberRows ?? []) as SettlementMemberRow[]
  if (rows.length === 0) {
    return { settlements: {} }
  }

  const settlementIds = [...new Set(rows.map((r) => r.settlement_id))]
  const { data: headers, error: headerError } = await supabase
    .from("settlements")
    .select(SETTLEMENT_HOME_HEADER_COLUMNS)
    .eq("guild_id", guildId)
    .in("id", settlementIds)
    .order("created_at", { ascending: false })

  if (headerError) throw headerError
  const settlementRows = (headers ?? []) as SettlementRow[]
  if (settlementRows.length === 0) {
    return { settlements: {} }
  }

  const ids = settlementRows.map((r) => r.id)
  const [allMemberRowsRes, namesRes, mgmtPaymentsMap] = await Promise.all([
    supabase.from("settlement_members").select(SETTLEMENT_MEMBER_COLUMNS).in("settlement_id", ids),
    supabase.from("members").select("id, nickname").eq("guild_id", guildId),
    fetchManagementPaymentsForSettlements(supabase, ids),
  ])

  if (allMemberRowsRes.error) throw allMemberRowsRes.error
  if (namesRes.error) throw namesRes.error

  const memberNames = new Map(
    (namesRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const settlements = buildSettlementsFromRows(
    settlementRows,
    (allMemberRowsRes.data ?? []) as SettlementMemberRow[],
    [],
    [],
    memberNames,
    mgmtPaymentsMap,
  )

  return { settlements }
}

export { makeSettlementKey }
