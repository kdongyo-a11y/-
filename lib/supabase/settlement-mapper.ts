import type {
  Settlement,
  SettlementModificationLog,
  SettlementParticipant,
  SettlementRevisionLog,
  SettlementRevisionSnapshot,
  SettlementSourceType,
} from "@/lib/settlement-types"
import type { OperationPolicySnapshot } from "@/lib/operation-settings-types"
import { makeSettlementKey } from "@/lib/settlement-types"

export type SettlementRow = {
  id: string
  guild_id: string
  source_type: SettlementSourceType
  source_id: string
  total_income: number
  guild_base_amount: number
  distributable_amount: number
  per_member_amount: number
  remainder_amount: number
  final_guild_amount: number
  revision: number
  status: "active" | "revision_in_progress" | "completed"
  memo: string
  display_title: string
  display_sub: string
  rounding_unit: number | null
  rounding_policy: string | null
  guild_share_ledger_amount: number | null
  guild_share_sub_thousand: number | null
  reserve_mode_applied: string | null
  reserve_percentage_applied: number | string | null
  management_fee_mode_applied: string | null
  management_fee_percentage_applied: number | string | null
  management_fee_total: number | null
  management_fee_manual_input: number | null
  operation_policy_snapshot: OperationPolicySnapshot | Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SettlementMemberRow = {
  id: string
  settlement_id: string
  member_id: string
  final_amount: number
  paid_amount: number
  admin_paid: boolean
  admin_paid_at: string | null
  member_received: boolean
  member_received_at: string | null
  adjustment_amount: number
  adjustment_type: SettlementParticipant["adjustmentType"]
  return_amount: number
  member_return_confirmed: boolean
  member_return_confirmed_at: string | null
  admin_return_confirmed: boolean
  admin_return_confirmed_at: string | null
  additional_amount: number
  additional_admin_paid: boolean
  additional_admin_paid_at: string | null
  additional_member_received: boolean
  additional_member_received_at: string | null
  personal_status: SettlementParticipant["personalStatus"]
}

export type SettlementRevisionRow = {
  id: string
  settlement_id: string
  revision: number
  previous_participant_count: number
  new_participant_count: number
  previous_per_member_amount: number
  new_per_member_amount: number
  previous_guild_amount: number
  new_guild_amount: number
  reason: string
  snapshot_json: SettlementRevisionSnapshot | Record<string, unknown>
  member_adjustments_json: SettlementRevisionLog["memberAdjustments"] | unknown[]
  created_by: string | null
  created_at: string
}

export type SettlementModificationLogRow = {
  id: string
  settlement_id: string
  member_id: string | null
  before_status: string
  after_status: string
  memo: string
  created_by: string | null
  created_at: string
}

function toEpoch(iso: string | null): number | null {
  if (!iso) return null
  return new Date(iso).getTime()
}

function memberRowToParticipant(
  row: SettlementMemberRow,
  name: string,
): SettlementParticipant {
  return {
    memberId: row.member_id,
    name,
    payoutAmount: Number(row.final_amount),
    adminPaid: row.admin_paid,
    adminPaidAt: toEpoch(row.admin_paid_at),
    memberReceived: row.member_received,
    memberReceivedAt: toEpoch(row.member_received_at),
    paidAmount: Number(row.paid_amount),
    adjustmentAmount: Number(row.adjustment_amount),
    adjustmentType: row.adjustment_type,
    returnAmount: Number(row.return_amount),
    memberReturnConfirmed: row.member_return_confirmed,
    memberReturnConfirmedAt: toEpoch(row.member_return_confirmed_at),
    adminReturnConfirmed: row.admin_return_confirmed,
    adminReturnConfirmedAt: toEpoch(row.admin_return_confirmed_at),
    additionalAmount: Number(row.additional_amount),
    additionalAdminPaid: row.additional_admin_paid,
    additionalAdminPaidAt: toEpoch(row.additional_admin_paid_at),
    additionalMemberReceived: row.additional_member_received,
    additionalMemberReceivedAt: toEpoch(row.additional_member_received_at),
    personalStatus: row.personal_status,
  }
}

export function participantToMemberRow(
  settlementId: string,
  p: SettlementParticipant,
): Omit<SettlementMemberRow, "id"> {
  return {
    settlement_id: settlementId,
    member_id: p.memberId,
    final_amount: p.payoutAmount,
    paid_amount: p.paidAmount,
    admin_paid: p.adminPaid,
    admin_paid_at: p.adminPaidAt ? new Date(p.adminPaidAt).toISOString() : null,
    member_received: p.memberReceived,
    member_received_at: p.memberReceivedAt ? new Date(p.memberReceivedAt).toISOString() : null,
    adjustment_amount: p.adjustmentAmount,
    adjustment_type: p.adjustmentType,
    return_amount: p.returnAmount,
    member_return_confirmed: p.memberReturnConfirmed,
    member_return_confirmed_at: p.memberReturnConfirmedAt
      ? new Date(p.memberReturnConfirmedAt).toISOString()
      : null,
    admin_return_confirmed: p.adminReturnConfirmed,
    admin_return_confirmed_at: p.adminReturnConfirmedAt
      ? new Date(p.adminReturnConfirmedAt).toISOString()
      : null,
    additional_amount: p.additionalAmount,
    additional_admin_paid: p.additionalAdminPaid,
    additional_admin_paid_at: p.additionalAdminPaidAt
      ? new Date(p.additionalAdminPaidAt).toISOString()
      : null,
    additional_member_received: p.additionalMemberReceived,
    additional_member_received_at: p.additionalMemberReceivedAt
      ? new Date(p.additionalMemberReceivedAt).toISOString()
      : null,
    personal_status: p.personalStatus,
  }
}

export function settlementToHeaderRow(
  settlement: Settlement,
  createdBy?: string | null,
): Omit<SettlementRow, "id" | "created_at" | "updated_at"> {
  return {
    source_type: settlement.sourceType,
    source_id: settlement.sourceId,
    total_income: settlement.totalRevenue,
    guild_base_amount: settlement.guildShareInput,
    distributable_amount: settlement.distributableAmount,
    per_member_amount: settlement.perPersonAmount,
    remainder_amount: settlement.remainder,
    final_guild_amount: settlement.guildShareFinal,
    revision: settlement.revision,
    status: settlement.overallStatus,
    memo: settlement.memo,
    display_title: settlement.displayTitle,
    display_sub: settlement.displaySub,
    rounding_unit: settlement.roundingUnit ?? null,
    rounding_policy: settlement.roundingPolicy ?? null,
    guild_share_ledger_amount: settlement.guildShareLedgerAmount ?? null,
    guild_share_sub_thousand: settlement.guildShareSubThousand ?? null,
    reserve_mode_applied: settlement.reserveModeApplied ?? null,
    reserve_percentage_applied: settlement.reservePercentageApplied ?? null,
    management_fee_mode_applied: settlement.managementFeeModeApplied ?? null,
    management_fee_percentage_applied: settlement.managementFeePercentageApplied ?? null,
    management_fee_total: settlement.managementFeeTotal ?? null,
    management_fee_manual_input: settlement.managementFeeManualInput ?? null,
    operation_policy_snapshot: settlement.operationPolicySnapshot ?? null,
    created_by: createdBy ?? null,
  }
}

export function buildSettlementsFromRows(
  rows: SettlementRow[],
  members: SettlementMemberRow[],
  revisions: SettlementRevisionRow[],
  modLogs: SettlementModificationLogRow[],
  memberNames: Map<string, string>,
  managementPaymentsBySettlement: Map<string, import("@/lib/settlement-management-payment-types").SettlementManagementPayment[]> = new Map(),
): Record<string, Settlement> {
  const membersBySettlement = new Map<string, SettlementMemberRow[]>()
  for (const m of members) {
    const list = membersBySettlement.get(m.settlement_id) ?? []
    list.push(m)
    membersBySettlement.set(m.settlement_id, list)
  }

  const revisionsBySettlement = new Map<string, SettlementRevisionRow[]>()
  for (const r of revisions) {
    const list = revisionsBySettlement.get(r.settlement_id) ?? []
    list.push(r)
    revisionsBySettlement.set(r.settlement_id, list)
  }

  const logsBySettlement = new Map<string, SettlementModificationLogRow[]>()
  for (const l of modLogs) {
    const list = logsBySettlement.get(l.settlement_id) ?? []
    list.push(l)
    logsBySettlement.set(l.settlement_id, list)
  }

  const result: Record<string, Settlement> = {}

  for (const row of rows) {
    const key = makeSettlementKey(row.source_type, row.source_id)
    const participantRows = membersBySettlement.get(row.id) ?? []
    const participants = participantRows.map((p) =>
      memberRowToParticipant(p, memberNames.get(p.member_id) ?? "혈원"),
    )

    const revisionRows = (revisionsBySettlement.get(row.id) ?? []).sort(
      (a, b) => a.revision - b.revision,
    )

    const revisionSnapshots: SettlementRevisionSnapshot[] = revisionRows
      .map((r) => r.snapshot_json)
      .filter((s): s is SettlementRevisionSnapshot => !!s && typeof s === "object" && "revision" in s)

    const revisionLogs: SettlementRevisionLog[] = revisionRows.map((r) => ({
      id: r.id,
      revision: r.revision,
      at: toEpoch(r.created_at) ?? Date.now(),
      reason: r.reason,
      beforeParticipantCount: r.previous_participant_count,
      afterParticipantCount: r.new_participant_count,
      beforePerPersonAmount: Number(r.previous_per_member_amount),
      afterPerPersonAmount: Number(r.new_per_member_amount),
      beforeGuildShareFinal: Number(r.previous_guild_amount),
      afterGuildShareFinal: Number(r.new_guild_amount),
      memberAdjustments: Array.isArray(r.member_adjustments_json)
        ? (r.member_adjustments_json as SettlementRevisionLog["memberAdjustments"])
        : [],
    }))

    const modificationLogs: SettlementModificationLog[] = (
      logsBySettlement.get(row.id) ?? []
    ).map((l) => ({
      id: l.id,
      at: toEpoch(l.created_at) ?? Date.now(),
      targetMemberId: l.member_id ?? "",
      targetName: l.member_id ? (memberNames.get(l.member_id) ?? "혈원") : "",
      field: l.before_status.includes("adminPaid") ? "adminPaid" : "memberReceived",
      beforeValue: l.before_status === "true",
      afterValue: l.after_status === "true",
      reason: l.memo,
    }))

    result[key] = {
      sourceType: row.source_type,
      sourceId: row.source_id,
      createdAt: toEpoch(row.created_at) ?? Date.now(),
      revision: row.revision,
      overallStatus: row.status,
      totalRevenue: Number(row.total_income),
      guildShareInput: Number(row.guild_base_amount),
      guildShareFinal: Number(row.final_guild_amount),
      distributableAmount: Number(row.distributable_amount),
      perPersonAmount: Number(row.per_member_amount),
      remainder: Number(row.remainder_amount),
      memo: row.memo,
      displayTitle: row.display_title,
      displaySub: row.display_sub,
      roundingUnit: row.rounding_unit != null ? Number(row.rounding_unit) : undefined,
      roundingPolicy: row.rounding_policy ?? undefined,
      guildShareLedgerAmount:
        row.guild_share_ledger_amount != null
          ? Number(row.guild_share_ledger_amount)
          : undefined,
      guildShareSubThousand:
        row.guild_share_sub_thousand != null
          ? Number(row.guild_share_sub_thousand)
          : undefined,
      operationPolicySnapshot: parseOperationPolicySnapshot(row.operation_policy_snapshot),
      managementFeeTotal:
        row.management_fee_total != null ? Number(row.management_fee_total) : undefined,
      managementFeeManualInput:
        row.management_fee_manual_input != null
          ? Number(row.management_fee_manual_input)
          : undefined,
      reserveModeApplied: row.reserve_mode_applied ?? undefined,
      reservePercentageApplied:
        row.reserve_percentage_applied != null
          ? Number(row.reserve_percentage_applied)
          : undefined,
      managementFeeModeApplied: row.management_fee_mode_applied ?? undefined,
      managementFeePercentageApplied:
        row.management_fee_percentage_applied != null
          ? Number(row.management_fee_percentage_applied)
          : undefined,
      participants,
      managementPayments: managementPaymentsBySettlement.get(row.id) ?? [],
      revisionSnapshots,
      revisionLogs,
      modificationLogs,
    }
  }

  return result
}

function parseOperationPolicySnapshot(
  value: OperationPolicySnapshot | Record<string, unknown> | null | undefined,
): OperationPolicySnapshot | undefined {
  if (!value || typeof value !== "object") return undefined
  if (!("reserveMode" in value) || !("managementFeeMode" in value)) return undefined
  return value as OperationPolicySnapshot
}
