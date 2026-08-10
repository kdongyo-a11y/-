import type { SupabaseClient } from "@supabase/supabase-js"
import type { SettlementManagementPayment } from "@/lib/settlement-management-payment-types"
import type { Settlement } from "@/lib/settlement-types"
import {
  buildManagementPaymentsFromSnapshot,
  deriveManagementPaymentStatus,
} from "@/lib/settlement-management-payment-utils"

export type SettlementManagementPaymentRow = {
  id: string
  guild_id: string
  settlement_id: string
  member_id: string
  snapshot_nickname: string
  ratio_bp: number
  amount: number
  admin_paid: boolean
  admin_paid_at: string | null
  admin_paid_by: string | null
  member_confirmed: boolean
  member_confirmed_at: string | null
  status: SettlementManagementPayment["status"]
  memo: string | null
  created_at: string
  updated_at: string
}

function toEpoch(iso: string | null): number | null {
  if (!iso) return null
  return new Date(iso).getTime()
}

export function mapManagementPaymentRow(row: SettlementManagementPaymentRow): SettlementManagementPayment {
  return {
    id: row.id,
    memberId: row.member_id,
    snapshotNickname: row.snapshot_nickname,
    ratioBp: Number(row.ratio_bp),
    amount: Number(row.amount),
    adminPaid: row.admin_paid,
    adminPaidAt: toEpoch(row.admin_paid_at),
    adminPaidBy: row.admin_paid_by,
    memberConfirmed: row.member_confirmed,
    memberConfirmedAt: toEpoch(row.member_confirmed_at),
    status: row.status,
    memo: row.memo,
  }
}

export function managementPaymentToRow(
  guildId: string,
  settlementId: string,
  payment: SettlementManagementPayment,
): Omit<SettlementManagementPaymentRow, "created_at" | "updated_at"> {
  return {
    id: payment.id,
    guild_id: guildId,
    settlement_id: settlementId,
    member_id: payment.memberId,
    snapshot_nickname: payment.snapshotNickname,
    ratio_bp: payment.ratioBp,
    amount: payment.amount,
    admin_paid: payment.adminPaid,
    admin_paid_at: payment.adminPaidAt ? new Date(payment.adminPaidAt).toISOString() : null,
    admin_paid_by: payment.adminPaidBy,
    member_confirmed: payment.memberConfirmed,
    member_confirmed_at: payment.memberConfirmedAt
      ? new Date(payment.memberConfirmedAt).toISOString()
      : null,
    status: payment.status,
    memo: payment.memo,
  }
}

export async function fetchManagementPaymentsForSettlements(
  admin: SupabaseClient,
  settlementIds: string[],
): Promise<Map<string, SettlementManagementPayment[]>> {
  const result = new Map<string, SettlementManagementPayment[]>()
  if (settlementIds.length === 0) return result

  const { data, error } = await admin
    .from("settlement_management_payments")
    .select("*")
    .in("settlement_id", settlementIds)

  if (error) {
    console.error("[fetchManagementPaymentsForSettlements]", error)
    return result
  }

  for (const row of (data ?? []) as SettlementManagementPaymentRow[]) {
    const list = result.get(row.settlement_id) ?? []
    list.push(mapManagementPaymentRow(row))
    result.set(row.settlement_id, list)
  }

  return result
}

export async function createManagementPaymentsOnSettlementCreate(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  settlement: Settlement,
): Promise<void> {
  const drafts = buildManagementPaymentsFromSnapshot(
    settlement.operationPolicySnapshot,
    settlement.managementFeeTotal,
  )
  if (drafts.length === 0) return

  const rows = drafts.map((d) => ({
    guild_id: guildId,
    settlement_id: settlementId,
    member_id: d.memberId,
    snapshot_nickname: d.snapshotNickname,
    ratio_bp: d.ratioBp,
    amount: d.amount,
    admin_paid: false,
    member_confirmed: false,
    status: "pending" as const,
  }))

  const { error } = await admin.from("settlement_management_payments").insert(rows)
  if (error?.code === "23505") {
    return
  }
  if (error) {
    console.error("[createManagementPaymentsOnSettlementCreate]", error)
    throw error
  }
}

export async function persistManagementPayments(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  payments: SettlementManagementPayment[],
): Promise<void> {
  for (const payment of payments) {
    const row = managementPaymentToRow(guildId, settlementId, payment)
    const { error } = await admin
      .from("settlement_management_payments")
      .update({
        admin_paid: row.admin_paid,
        admin_paid_at: row.admin_paid_at,
        admin_paid_by: row.admin_paid_by,
        member_confirmed: row.member_confirmed,
        member_confirmed_at: row.member_confirmed_at,
        status: row.status,
        memo: row.memo,
      })
      .eq("id", payment.id)
      .eq("guild_id", guildId)
      .eq("settlement_id", settlementId)

    if (error) {
      console.error("[persistManagementPayments]", error)
      throw error
    }
  }
}

export async function appendManagementPaymentLog(
  admin: SupabaseClient,
  guildId: string,
  paymentId: string,
  action: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  actorMemberId: string | null,
  reason: string,
): Promise<void> {
  const { error } = await admin.from("settlement_management_payment_logs").insert({
    guild_id: guildId,
    payment_id: paymentId,
    action,
    before_json: before,
    after_json: after,
    actor_member_id: actorMemberId,
    reason,
  })
  if (error) {
    console.error("[appendManagementPaymentLog]", error)
  }
}

export async function getManagementPaymentBySettlementMember(
  admin: SupabaseClient,
  guildId: string,
  settlementId: string,
  memberId: string,
): Promise<SettlementManagementPayment | null> {
  const { data, error } = await admin
    .from("settlement_management_payments")
    .select("*")
    .eq("guild_id", guildId)
    .eq("settlement_id", settlementId)
    .eq("member_id", memberId)
    .maybeSingle()

  if (error || !data) return null
  return mapManagementPaymentRow(data as SettlementManagementPaymentRow)
}

export function paymentSnapshotForLog(p: SettlementManagementPayment): Record<string, unknown> {
  return {
    adminPaid: p.adminPaid,
    memberConfirmed: p.memberConfirmed,
    status: p.status,
    memo: p.memo,
  }
}

export function syncPaymentStatus(p: SettlementManagementPayment): SettlementManagementPayment {
  return {
    ...p,
    status: deriveManagementPaymentStatus(p.adminPaid, p.memberConfirmed),
  }
}
