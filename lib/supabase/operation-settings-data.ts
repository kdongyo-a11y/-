import type { SupabaseClient } from "@supabase/supabase-js"
import type {
  ActiveMemberOption,
  GuildOperationPolicyView,
  GuildOperationSettings,
  PolicyAmountMode,
  PolicyVersionStatus,
} from "@/lib/operation-settings-types"
import {
  DEFAULT_GUILD_OPERATION_SETTINGS,
  isValidPolicyAmountMode,
  validateOperationSettingsInput,
} from "@/lib/operation-settings-utils"
import { isEffectiveFromAllowedForNewPolicy } from "@/lib/operation-policy-kst-utils"
import {
  buildPolicySnapshotV1,
  canCancelPolicyVersion,
  computePolicyVersionStatus,
  financeSettingsFromSnapshot,
  getCurrentPolicyVersion,
  getNextScheduledPolicyVersion,
  getScheduledPolicyVersions,
  hasDuplicateActiveEffectiveFrom,
  parsePolicySnapshotPayload,
  selectPolicyVersionForOccurredAt,
  type GuildOperationPolicyVersion,
} from "@/lib/operation-policy-version-utils"
import {
  toMemberPolicySnapshotPublic,
  buildFinanceChangeSummaryLines,
  type MemberOperationPolicyPublicView,
} from "@/lib/operation-policy-display-utils"
import { requireActiveMembersInActorGuild } from "@/lib/supabase/guild-scope-helpers"

type VersionRow = {
  id: string
  guild_id: string
  version: number
  effective_from: string
  created_at: string
  created_by: string | null
  change_reason: string
  policy_snapshot: unknown
  cancelled_at: string | null
  cancelled_by: string | null
  cancel_reason: string | null
}

function mapVersionRow(row: VersionRow): GuildOperationPolicyVersion | null {
  const policySnapshot = parsePolicySnapshotPayload(row.policy_snapshot)
  if (!policySnapshot) return null
  return {
    id: row.id,
    guildId: row.guild_id,
    version: row.version,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    createdBy: row.created_by,
    changeReason: row.change_reason,
    policySnapshot,
    cancelledAt: row.cancelled_at,
    cancelledBy: row.cancelled_by,
    cancelReason: row.cancel_reason,
  }
}

function toSummary(
  v: GuildOperationPolicyVersion,
  status: PolicyVersionStatus,
): GuildOperationPolicyView["currentPolicy"] {
  return {
    id: v.id,
    version: v.version,
    effectiveFrom: v.effectiveFrom,
    createdAt: v.createdAt,
    changeReason: v.changeReason,
    cancelledAt: v.cancelledAt,
    policySnapshot: v.policySnapshot,
    status,
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

export async function fetchGuildOperationPolicyVersions(
  admin: SupabaseClient,
  guildId: string,
): Promise<GuildOperationPolicyVersion[]> {
  const { data, error } = await admin
    .from("guild_operation_policy_versions")
    .select("*")
    .eq("guild_id", guildId)
    .order("effective_from", { ascending: false })
    .order("version", { ascending: false })

  if (error) {
    console.error("[fetchGuildOperationPolicyVersions]", error)
    return []
  }

  return ((data ?? []) as VersionRow[])
    .map(mapVersionRow)
    .filter((v): v is GuildOperationPolicyVersion => v != null)
}

export async function fetchGuildOperationPolicyView(
  admin: SupabaseClient,
  guildId: string,
  occurredAtIso?: string,
): Promise<GuildOperationPolicyView> {
  const [versions, members] = await Promise.all([
    fetchGuildOperationPolicyVersions(admin, guildId),
    fetchActiveGuildMembers(admin, guildId),
  ])
  const nameById = new Map(members.map((m) => [m.id, m.nickname]))
  const nowIso = new Date().toISOString()
  const current = getCurrentPolicyVersion(versions, nowIso)
  const scheduledRaw = getScheduledPolicyVersions(versions, nowIso)
  const nextScheduled = scheduledRaw[0] ?? null
  const atOccurred = occurredAtIso
    ? selectPolicyVersionForOccurredAt(versions, occurredAtIso)
    : current

  const settings = atOccurred
    ? financeSettingsFromSnapshot(atOccurred.policySnapshot, nameById)
    : { ...DEFAULT_GUILD_OPERATION_SETTINGS, updatedAt: null }

  const withStatus = (v: GuildOperationPolicyVersion) =>
    toSummary(v, computePolicyVersionStatus(v, nowIso, current))

  return {
    currentPolicy: current ? withStatus(current) : null,
    nextScheduledPolicy: nextScheduled ? withStatus(nextScheduled) : null,
    scheduledPolicies: scheduledRaw.map(withStatus),
    settings,
    versions: versions.map(withStatus).filter((v): v is NonNullable<typeof v> => v != null),
  }
}

export async function fetchMemberOperationPolicyPublicView(
  admin: SupabaseClient,
  guildId: string,
): Promise<MemberOperationPolicyPublicView> {
  const [versions, members] = await Promise.all([
    fetchGuildOperationPolicyVersions(admin, guildId),
    fetchActiveGuildMembers(admin, guildId),
  ])
  const nameById = new Map(members.map((m) => [m.id, m.nickname]))
  const nowIso = new Date().toISOString()
  const current = getCurrentPolicyVersion(versions, nowIso)
  const scheduledRaw = getScheduledPolicyVersions(versions, nowIso)

  const toPublic = (v: GuildOperationPolicyVersion) =>
    toMemberPolicySnapshotPublic(
      {
        effectiveFrom: v.effectiveFrom,
        changeReason: v.changeReason,
        policySnapshot: v.policySnapshot,
      },
      nameById,
    )

  const scheduledPolicies = scheduledRaw.map(toPublic)
  const nextScheduledPolicy = scheduledPolicies[0] ?? null
  const nextScheduledChangeLines =
    nextScheduledPolicy && current
      ? buildFinanceChangeSummaryLines(
          current.policySnapshot.finance,
          scheduledRaw[0]!.policySnapshot.finance,
        )
      : nextScheduledPolicy
        ? buildFinanceChangeSummaryLines(null, scheduledRaw[0]!.policySnapshot.finance)
        : []

  return {
    currentPolicy: current ? toPublic(current) : null,
    nextScheduledPolicy,
    nextScheduledChangeLines,
    scheduledPolicies,
    additionalScheduledCount: Math.max(0, scheduledPolicies.length - 1),
  }
}

/** @deprecated use fetchGuildOperationPolicyView — 현재 시각 기준 settings */
export async function fetchGuildOperationSettings(
  admin: SupabaseClient,
  guildId: string,
): Promise<GuildOperationSettings> {
  const view = await fetchGuildOperationPolicyView(admin, guildId)
  return view.settings
}

export async function createGuildOperationPolicyVersionOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  input: {
    managementFeeMode: PolicyAmountMode
    managementFeePercentage: number | null
    reserveMode: PolicyAmountMode
    reservePercentage: number | null
    allocations: Array<{ memberId: string; ratioBp: number }>
    changeReason: string
    effectiveFromIso: string
    allowPastEffectiveFrom?: boolean
  },
): Promise<
  { ok: true; view: GuildOperationPolicyView; version: GuildOperationPolicyVersion } | {
      ok: false
      message: string
    }
> {
  if (!input.changeReason.trim()) {
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

  if (!input.allowPastEffectiveFrom && !isEffectiveFromAllowedForNewPolicy(input.effectiveFromIso)) {
    return {
      ok: false,
      message: "시행 시각은 현재 시각 이후여야 합니다. 과거 활동에 소급 적용할 수 없습니다.",
    }
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

  const existingVersions = await fetchGuildOperationPolicyVersions(admin, guildId)
  if (hasDuplicateActiveEffectiveFrom(existingVersions, input.effectiveFromIso)) {
    return {
      ok: false,
      message:
        "동일한 시행 시각의 예약 정책이 이미 존재합니다. 기존 예약을 취소한 후 다시 등록해주세요.",
    }
  }

  const { data: maxRow } = await admin
    .from("guild_operation_policy_versions")
    .select("version")
    .eq("guild_id", guildId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextVersion = Number(maxRow?.version ?? 0) + 1
  const policySnapshot = buildPolicySnapshotV1({
    managementFeeMode: input.managementFeeMode,
    managementFeePercentage: input.managementFeePercentage,
    reserveMode: input.reserveMode,
    reservePercentage: input.reservePercentage,
    allocations: input.allocations,
  })

  const { data, error } = await admin
    .from("guild_operation_policy_versions")
    .insert({
      guild_id: guildId,
      version: nextVersion,
      effective_from: input.effectiveFromIso,
      created_by: actorId,
      change_reason: input.changeReason.trim(),
      policy_snapshot: policySnapshot,
    })
    .select("*")
    .single()

  if (error || !data) {
    if (error?.code === "23505") {
      return {
        ok: false,
        message:
          "동일한 시행 시각의 예약 정책이 이미 존재합니다. 기존 예약을 취소한 후 다시 등록해주세요.",
      }
    }
    console.error("[createGuildOperationPolicyVersionOnServer]", error)
    return { ok: false, message: "운영 정책 version 저장에 실패했습니다." }
  }

  const mapped = mapVersionRow(data as VersionRow)
  if (!mapped) {
    return { ok: false, message: "정책 snapshot 형식이 올바르지 않습니다." }
  }

  const view = await fetchGuildOperationPolicyView(admin, guildId)
  return { ok: true, view, version: mapped }
}

export async function cancelScheduledPolicyVersionOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  versionId: string,
  cancelReason: string,
): Promise<{ ok: true; view: GuildOperationPolicyView } | { ok: false; message: string }> {
  if (!cancelReason.trim()) {
    return { ok: false, message: "취소 사유를 입력해주세요." }
  }

  const { data, error } = await admin
    .from("guild_operation_policy_versions")
    .select("*")
    .eq("id", versionId)
    .eq("guild_id", guildId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: "정책 version을 찾을 수 없습니다." }
  }

  const version = mapVersionRow(data as VersionRow)
  if (!version) {
    return { ok: false, message: "정책 snapshot이 올바르지 않습니다." }
  }

  if (!canCancelPolicyVersion(version)) {
    return {
      ok: false,
      message: "이미 시행된 정책은 취소할 수 없습니다. 예약 정책만 취소 가능합니다.",
    }
  }

  if (version.cancelledAt) {
    return { ok: false, message: "이미 취소된 예약 정책입니다." }
  }

  const { error: updateError } = await admin
    .from("guild_operation_policy_versions")
    .update({
      cancelled_at: new Date().toISOString(),
      cancelled_by: actorId,
      cancel_reason: cancelReason.trim(),
    })
    .eq("id", versionId)
    .eq("guild_id", guildId)
    .is("cancelled_at", null)

  if (updateError) {
    console.error("[cancelScheduledPolicyVersionOnServer]", updateError)
    return { ok: false, message: "예약 정책 취소에 실패했습니다." }
  }

  const view = await fetchGuildOperationPolicyView(admin, guildId)
  return { ok: true, view }
}

export async function resolveSettlementPolicyInputs(
  admin: SupabaseClient,
  guildId: string,
  occurredAtIso: string,
  totalRevenue: number,
  reserveManualInput: number,
  managementFeeManualInput: number,
): Promise<
  | {
      ok: true
      policyVersionId: string
      policyVersion: number
      policyEffectiveFrom: string
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
  const versions = await fetchGuildOperationPolicyVersions(admin, guildId)
  const selected = selectPolicyVersionForOccurredAt(versions, occurredAtIso)
  if (!selected) {
    return { ok: false, message: "해당 시점에 적용할 운영 정책이 없습니다." }
  }

  const members = await fetchActiveGuildMembers(admin, guildId)
  const nameById = new Map(members.map((m) => [m.id, m.nickname]))
  const settings = financeSettingsFromSnapshot(selected.policySnapshot, nameById)

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
    policyVersionId: selected.id,
    policyVersion: selected.version,
    policyEffectiveFrom: selected.effectiveFrom,
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
