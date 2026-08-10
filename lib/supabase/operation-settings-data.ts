import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ActiveMemberOption,
  GuildOperationSettingLog,
  GuildOperationSettings,
  PolicyAmountMode,
} from "@/lib/operation-settings-types"
import {
  DEFAULT_GUILD_OPERATION_SETTINGS,
  isValidPolicyAmountMode,
  validateOperationSettingsInput,
} from "@/lib/operation-settings-utils"
import { requireActiveMembersInActorGuild } from "@/lib/supabase/guild-scope-helpers"

type SettingsRow = {
  guild_id: string
  management_fee_mode: string
  management_fee_percentage: number | string | null
  reserve_mode: string
  reserve_percentage: number | string | null
  updated_at: string | null
}

type AllocationRow = {
  member_id: string
  ratio_bp: number
}

function mapSettingsRow(
  row: SettingsRow | null,
  allocations: Array<{ memberId: string; nickname: string; ratioBp: number }>,
): GuildOperationSettings {
  if (!row) {
    return {
      ...DEFAULT_GUILD_OPERATION_SETTINGS,
      updatedAt: null,
    }
  }

  return {
    managementFeeMode: row.management_fee_mode as PolicyAmountMode,
    managementFeePercentage:
      row.management_fee_percentage != null ? Number(row.management_fee_percentage) : null,
    reserveMode: row.reserve_mode as PolicyAmountMode,
    reservePercentage: row.reserve_percentage != null ? Number(row.reserve_percentage) : null,
    allocations,
    updatedAt: row.updated_at,
  }
}

export async function fetchActiveGuildMembers(
  admin: SupabaseClient,
  guildId: string,
): Promise<ActiveMemberOption[]> {
  const { data, error } = await admin
    .from("members")
    .select("id, nickname, role, position")
    .eq("guild_id", guildId)
    .eq("status", "활동")
    .order("nickname")

  if (error) {
    console.error("[fetchActiveGuildMembers]", error)
    return []
  }

  return (data ?? []).map((m: { id: string; nickname: string; role: string; position: string }) => ({
    id: m.id,
    nickname: m.nickname,
    role: m.role,
    position: m.position,
  }))
}

export async function fetchGuildOperationSettings(
  admin: SupabaseClient,
  guildId: string,
): Promise<GuildOperationSettings> {
  const [settingsRes, allocRes, members] = await Promise.all([
    admin.from("guild_operation_settings").select("*").eq("guild_id", guildId).maybeSingle(),
    admin
      .from("guild_management_fee_allocations")
      .select("member_id, ratio_bp")
      .eq("guild_id", guildId),
    fetchActiveGuildMembers(admin, guildId),
  ])

  if (settingsRes.error) {
    console.error("[fetchGuildOperationSettings]", settingsRes.error)
  }
  if (allocRes.error) {
    console.error("[fetchGuildOperationSettings/alloc]", allocRes.error)
  }

  const nameById = new Map(members.map((m) => [m.id, m.nickname]))
  const allocations = ((allocRes.data ?? []) as AllocationRow[]).map((a) => ({
    memberId: a.member_id,
    nickname: nameById.get(a.member_id) ?? "혈원",
    ratioBp: a.ratio_bp,
  }))

  return mapSettingsRow((settingsRes.data as SettingsRow | null) ?? null, allocations)
}

export async function fetchGuildOperationSettingLogs(
  admin: SupabaseClient,
  guildId: string,
  limit = 30,
): Promise<GuildOperationSettingLog[]> {
  const { data, error } = await admin
    .from("guild_operation_setting_logs")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[fetchGuildOperationSettingLogs]", error)
    return []
  }

  return (data ?? []).map(
    (row: {
      id: string
      previous_snapshot: Record<string, unknown>
      new_snapshot: Record<string, unknown>
      reason: string
      created_by: string | null
      created_at: string
    }) => ({
      id: row.id,
      previousSnapshot: row.previous_snapshot ?? {},
      newSnapshot: row.new_snapshot ?? {},
      reason: row.reason,
      createdBy: row.created_by,
      createdAt: row.created_at,
    }),
  )
}

export async function updateGuildOperationSettingsOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  input: {
    managementFeeMode: PolicyAmountMode
    managementFeePercentage: number | null
    reserveMode: PolicyAmountMode
    reservePercentage: number | null
    allocations: Array<{ memberId: string; ratioBp: number }>
    reason: string
  },
): Promise<{ ok: true; settings: GuildOperationSettings } | { ok: false; message: string }> {
  if (!input.reason.trim()) {
    return { ok: false, message: "변경 사유를 입력해주세요." }
  }

  if (!isValidPolicyAmountMode(input.managementFeeMode) || !isValidPolicyAmountMode(input.reserveMode)) {
    return { ok: false, message: "산정 방식이 올바르지 않습니다." }
  }

  const validation = validateOperationSettingsInput({
    managementFeeMode: input.managementFeeMode,
    managementFeePercentage: input.managementFeePercentage,
    reserveMode: input.reserveMode,
    reservePercentage: input.reservePercentage,
    allocations: input.allocations,
  })
  if (!validation.ok) {
    return validation
  }

  if (input.managementFeeMode !== "none" && input.allocations.length > 0) {
    const scope = await requireActiveMembersInActorGuild(
      admin,
      guildId,
      input.allocations.map((a) => a.memberId),
    )
    if (!scope.ok) {
      return { ok: false, message: scope.message }
    }
  }

  const previous = await fetchGuildOperationSettings(admin, guildId)

  const { error: upsertError } = await admin.from("guild_operation_settings").upsert({
    guild_id: guildId,
    management_fee_mode: input.managementFeeMode,
    management_fee_percentage:
      input.managementFeeMode === "percentage" ? input.managementFeePercentage : null,
    reserve_mode: input.reserveMode,
    reserve_percentage: input.reserveMode === "percentage" ? input.reservePercentage : null,
    updated_at: new Date().toISOString(),
  })

  if (upsertError) {
    console.error("[updateGuildOperationSettingsOnServer]", upsertError)
    return { ok: false, message: "운영 정책 저장에 실패했습니다." }
  }

  await admin.from("guild_management_fee_allocations").delete().eq("guild_id", guildId)

  if (input.managementFeeMode !== "none" && input.allocations.length > 0) {
    const { error: allocError } = await admin.from("guild_management_fee_allocations").insert(
      input.allocations.map((a) => ({
        guild_id: guildId,
        member_id: a.memberId,
        ratio_bp: a.ratioBp,
      })),
    )
    if (allocError) {
      console.error("[updateGuildOperationSettingsOnServer/alloc]", allocError)
      return { ok: false, message: "관리비 배분 설정 저장에 실패했습니다." }
    }
  }

  const settings = await fetchGuildOperationSettings(admin, guildId)

  const { error: logError } = await admin.from("guild_operation_setting_logs").insert({
    guild_id: guildId,
    previous_snapshot: previous,
    new_snapshot: settings,
    reason: input.reason.trim(),
    created_by: actorId,
  })
  if (logError) {
    console.error("[updateGuildOperationSettingsOnServer/log]", logError)
  }

  return { ok: true, settings }
}

export async function resolveSettlementPolicyInputs(
  admin: SupabaseClient,
  guildId: string,
  totalRevenue: number,
  reserveManualInput: number,
  managementFeeManualInput: number,
): Promise<
  | {
      ok: true
      reserveMode: PolicyAmountMode
      reservePercentage: number | null
      reserveManualInput: number
      managementFeeMode: PolicyAmountMode
      managementFeePercentage: number | null
      managementFeeManualInput: number
      allocations: Array<{ memberId: string; nickname: string; ratioBp: number }>
    }
  | { ok: false; message: string }
> {
  const settings = await fetchGuildOperationSettings(admin, guildId)

  if (settings.reserveMode === "manual_per_settlement") {
    if (reserveManualInput < 0 || reserveManualInput > totalRevenue) {
      return { ok: false, message: "혈맹 비축금이 올바르지 않습니다." }
    }
  }

  if (settings.managementFeeMode === "manual_per_settlement") {
    if (managementFeeManualInput < 0 || managementFeeManualInput > totalRevenue) {
      return { ok: false, message: "관리비가 올바르지 않습니다." }
    }
  }

  if (settings.managementFeeMode !== "none") {
    const ratioCheck = validateOperationSettingsInput({
      managementFeeMode: settings.managementFeeMode,
      managementFeePercentage: settings.managementFeePercentage,
      reserveMode: settings.reserveMode,
      reservePercentage: settings.reservePercentage,
      allocations: settings.allocations,
    })
    if (!ratioCheck.ok) {
      return ratioCheck
    }
  }

  return {
    ok: true,
    reserveMode: settings.reserveMode,
    reservePercentage: settings.reservePercentage,
    reserveManualInput:
      settings.reserveMode === "manual_per_settlement" ? reserveManualInput : 0,
    managementFeeMode: settings.managementFeeMode,
    managementFeePercentage: settings.managementFeePercentage,
    managementFeeManualInput:
      settings.managementFeeMode === "manual_per_settlement" ? managementFeeManualInput : 0,
    allocations: settings.allocations,
  }
}
