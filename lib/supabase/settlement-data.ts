import type { SupabaseClient } from "@supabase/supabase-js"
import type { Settlement } from "@/lib/settlement-types"
import { makeSettlementKey } from "@/lib/settlement-types"
import {
  buildSettlementsFromRows,
  participantToMemberRow,
  settlementToHeaderRow,
  type SettlementMemberRow,
  type SettlementModificationLogRow,
  type SettlementRevisionRow,
  type SettlementRow,
} from "@/lib/supabase/settlement-mapper"

export async function fetchSettlementOperationalData(supabase: SupabaseClient) {
  const { data: rows, error } = await supabase.from("settlements").select("*").order("created_at", {
    ascending: false,
  })

  if (error) throw error

  const settlementRows = (rows ?? []) as SettlementRow[]
  if (settlementRows.length === 0) {
    return { settlements: {} as Record<string, Settlement> }
  }

  const ids = settlementRows.map((r) => r.id)

  const [membersRes, revisionsRes, logsRes, namesRes] = await Promise.all([
    supabase.from("settlement_members").select("*").in("settlement_id", ids),
    supabase.from("settlement_revisions").select("*").in("settlement_id", ids),
    supabase.from("settlement_modification_logs").select("*").in("settlement_id", ids),
    supabase.from("members").select("id, nickname"),
  ])

  if (membersRes.error) throw membersRes.error
  if (revisionsRes.error) throw revisionsRes.error
  if (logsRes.error) throw logsRes.error
  if (namesRes.error) throw namesRes.error

  const memberNames = new Map(
    (namesRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const settlements = buildSettlementsFromRows(
    settlementRows,
    (membersRes.data ?? []) as SettlementMemberRow[],
    (revisionsRes.data ?? []) as SettlementRevisionRow[],
    (logsRes.data ?? []) as SettlementModificationLogRow[],
    memberNames,
  )

  return { settlements }
}

export async function persistSettlement(
  admin: SupabaseClient,
  settlement: Settlement,
  actorId: string | null,
  guildId: string,
  options?: {
    newRevisionLog?: {
      snapshot: Settlement["revisionSnapshots"][number]
      log: Settlement["revisionLogs"][number]
    }
    newModificationLog?: Settlement["modificationLogs"][number]
  },
): Promise<{ settlementId: string }> {
  const { data: existing } = await admin
    .from("settlements")
    .select("id")
    .eq("guild_id", guildId)
    .eq("source_type", settlement.sourceType)
    .eq("source_id", settlement.sourceId)
    .maybeSingle()

  let settlementId = existing?.id as string | undefined

  const header = { ...settlementToHeaderRow(settlement, actorId), guild_id: guildId }

  if (settlementId) {
    const { error } = await admin
      .from("settlements")
      .update(header)
      .eq("id", settlementId)
      .eq("guild_id", guildId)
    if (error) throw error
  } else {
    const { data, error } = await admin
      .from("settlements")
      .insert(header)
      .select("id")
      .single()
    if (error) throw error
    settlementId = data.id
  }

  const { data: currentMembers } = await admin
    .from("settlement_members")
    .select("id, member_id")
    .eq("settlement_id", settlementId)

  const currentByMember = new Map(
    (currentMembers ?? []).map((m: { id: string; member_id: string }) => [m.member_id, m.id]),
  )
  const nextMemberIds = new Set(settlement.participants.map((p) => p.memberId))

  for (const p of settlement.participants) {
    const row = participantToMemberRow(settlementId!, p)
    const existingMemberRowId = currentByMember.get(p.memberId)
    if (existingMemberRowId) {
      const { error } = await admin
        .from("settlement_members")
        .update(row)
        .eq("id", existingMemberRowId)
      if (error) throw error
    } else {
      const { error } = await admin.from("settlement_members").insert(row)
      if (error) throw error
    }
  }

  for (const [memberId, rowId] of currentByMember) {
    if (!nextMemberIds.has(memberId)) {
      await admin.from("settlement_members").delete().eq("id", rowId)
    }
  }

  if (options?.newRevisionLog) {
    const { log, snapshot } = options.newRevisionLog
    await admin.from("settlement_revisions").upsert(
      {
        settlement_id: settlementId,
        revision: log.revision,
        previous_participant_count: log.beforeParticipantCount,
        new_participant_count: log.afterParticipantCount,
        previous_per_member_amount: log.beforePerPersonAmount,
        new_per_member_amount: log.afterPerPersonAmount,
        previous_guild_amount: log.beforeGuildShareFinal,
        new_guild_amount: log.afterGuildShareFinal,
        reason: log.reason,
        snapshot_json: snapshot,
        member_adjustments_json: log.memberAdjustments,
        created_by: actorId,
      },
      { onConflict: "settlement_id,revision" },
    )
  }

  if (options?.newModificationLog) {
    const log = options.newModificationLog
    await admin.from("settlement_modification_logs").insert({
      settlement_id: settlementId,
      member_id: log.targetMemberId,
      before_status: String(log.beforeValue),
      after_status: String(log.afterValue),
      memo: log.reason,
      created_by: actorId,
    })
  }

  return { settlementId: settlementId! }
}

export async function getSettlementByKey(
  admin: SupabaseClient,
  guildId: string,
  sourceType: Settlement["sourceType"],
  sourceId: string,
): Promise<Settlement | null> {
  const { data: row } = await admin
    .from("settlements")
    .select("*")
    .eq("guild_id", guildId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .maybeSingle()

  if (!row) return null

  const settlementId = row.id as string
  const [membersRes, revisionsRes, logsRes, namesRes] = await Promise.all([
    admin.from("settlement_members").select("*").eq("settlement_id", settlementId),
    admin.from("settlement_revisions").select("*").eq("settlement_id", settlementId),
    admin.from("settlement_modification_logs").select("*").eq("settlement_id", settlementId),
    admin.from("members").select("id, nickname").eq("guild_id", guildId),
  ])

  const memberNames = new Map(
    (namesRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const map = buildSettlementsFromRows(
    [row as SettlementRow],
    (membersRes.data ?? []) as SettlementMemberRow[],
    (revisionsRes.data ?? []) as SettlementRevisionRow[],
    (logsRes.data ?? []) as SettlementModificationLogRow[],
    memberNames,
  )

  return map[makeSettlementKey(sourceType, sourceId)] ?? null
}

export async function getSettlementByIdForGuild(
  admin: SupabaseClient,
  settlementId: string,
  guildId: string,
): Promise<{ id: string; guild_id: string; source_type: string; source_id: string } | null> {
  const { data, error } = await admin
    .from("settlements")
    .select("id, guild_id, source_type, source_id")
    .eq("id", settlementId)
    .eq("guild_id", guildId)
    .maybeSingle()

  if (error || !data) return null
  return data
}
