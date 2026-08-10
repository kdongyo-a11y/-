import type {
  ManagementPaymentStatus,
  PendingManagementFeeItem,
  SettlementManagementPayment,
} from "@/lib/settlement-management-payment-types"
import type { OperationPolicySnapshot } from "@/lib/operation-settings-types"
import type { Settlement, SettlementSourceType } from "@/lib/settlement-types"
import { makeSettlementKey } from "@/lib/settlement-types"

export function deriveManagementPaymentStatus(
  adminPaid: boolean,
  memberConfirmed: boolean,
): ManagementPaymentStatus {
  if (memberConfirmed) return "confirmed"
  if (adminPaid) return "paid"
  return "pending"
}

export function buildManagementPaymentsFromSnapshot(
  snapshot: OperationPolicySnapshot | undefined,
  managementFeeTotal: number | undefined,
): Omit<SettlementManagementPayment, "id">[] {
  const allocations = snapshot?.managementAllocations ?? []
  const total = managementFeeTotal ?? snapshot?.managementFeeTotal ?? 0
  if (total <= 0) return []

  return allocations
    .filter((a) => a.amount > 0)
    .map((a) => ({
      memberId: a.memberId,
      snapshotNickname: a.nickname,
      ratioBp: a.ratioBp,
      amount: a.amount,
      adminPaid: false,
      adminPaidAt: null,
      adminPaidBy: null,
      memberConfirmed: false,
      memberConfirmedAt: null,
      status: "pending" as const,
      memo: null,
    }))
}

export function onManagementAdminPaid(
  payment: SettlementManagementPayment,
  actorId: string,
  now = Date.now(),
): SettlementManagementPayment {
  return {
    ...payment,
    adminPaid: true,
    adminPaidAt: now,
    adminPaidBy: actorId,
    status: deriveManagementPaymentStatus(true, payment.memberConfirmed),
  }
}

export function onManagementAdminPaidCancelled(
  payment: SettlementManagementPayment,
): SettlementManagementPayment {
  if (payment.memberConfirmed) return payment
  return {
    ...payment,
    adminPaid: false,
    adminPaidAt: null,
    adminPaidBy: null,
    status: "pending",
  }
}

export function onManagementMemberConfirmed(
  payment: SettlementManagementPayment,
  now = Date.now(),
): SettlementManagementPayment {
  if (!payment.adminPaid) return payment
  return {
    ...payment,
    memberConfirmed: true,
    memberConfirmedAt: now,
    status: "confirmed",
  }
}

export function getManagementPaymentPendingState(
  payment: SettlementManagementPayment,
): Pick<PendingManagementFeeItem, "actionable" | "kind"> | null {
  if (payment.status === "confirmed") return null
  if (!payment.adminPaid) {
    return { kind: "awaiting_admin", actionable: false }
  }
  if (!payment.memberConfirmed) {
    return { kind: "awaiting_receipt", actionable: true }
  }
  return null
}

export function getPendingManagementFeesForMember(
  settlements: Record<string, Settlement>,
  memberId: string,
): PendingManagementFeeItem[] {
  return Object.entries(settlements)
    .flatMap(([key, settlement]) => {
      const payment = settlement.managementPayments?.find((p) => p.memberId === memberId)
      if (!payment) return []
      const pending = getManagementPaymentPendingState(payment)
      if (!pending || pending.kind !== "awaiting_receipt") return []

      return [
        {
          key,
          sourceType: settlement.sourceType,
          sourceId: settlement.sourceId,
          displayTitle: settlement.displayTitle,
          displaySub: settlement.displaySub,
          amount: payment.amount,
          payment,
          actionable: pending.actionable,
          kind: pending.kind,
        },
      ]
    })
    .sort((a, b) => {
      const sa = settlements[a.key]?.createdAt ?? 0
      const sb = settlements[b.key]?.createdAt ?? 0
      return sb - sa
    })
}

export function sumManagementPaymentAmounts(payments: SettlementManagementPayment[]): number {
  return payments.reduce((sum, p) => sum + p.amount, 0)
}

export function verifyManagementPaymentAmountInvariant(
  payments: SettlementManagementPayment[],
  managementFeeTotal: number,
  managementSplitScrap: number,
): boolean {
  return sumManagementPaymentAmounts(payments) + managementSplitScrap === managementFeeTotal
}
