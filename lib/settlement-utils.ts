import {
  MONEY_ROUNDING_POLICY,
  MONEY_ROUNDING_UNIT,
  assertNonNegativeMoney,
  calcThousandRoundedPerPersonAmount,
  guildShareLedgerAndSub,
  normalizeMoneyInput,
  subThousandRemainder,
} from "@/lib/money-utils"
import type { ManagementFeeAllocation, OperationPolicySnapshot } from "@/lib/operation-settings-types"
import { calcSettlementWithPolicy } from "@/lib/operation-settings-utils"

export type SettlementCalcInput = {
  totalRevenue: number
  guildShareInput: number
  participantCount: number
}

export type SettlementCalcResult = {
  /** 실제 발생 총수익 — 원본 그대로 보존 */
  totalRevenue: number
  /** manual 입력 혈맹 귀속(1,000원 단위 절사) */
  guildShareInput: number
  /** manual 입력 절사로 인한 혈맹 귀속 짜투리 */
  guildInputScrap: number
  distributableAmount: number
  perPersonAmount: number
  /** 분배 절사 remainder → 혈맹 귀속 */
  remainder: number
  guildShareFinal: number
  totalDistributed: number
  /** settlement ledger upsert용 (1,000원 배수) */
  guildShareLedgerAmount: number
  /** settlement sub-thousand → guild carry pool */
  guildShareSubThousand: number
  roundingUnit: number
  roundingPolicy: typeof MONEY_ROUNDING_POLICY
  /** Phase 9b */
  managementFeeTotal?: number
  managementFeeScrap?: number
  managementSplitScrap?: number
  managementAllocations?: ManagementFeeAllocation[]
  operationPolicySnapshot?: OperationPolicySnapshot
}

export function calcSettlement({
  totalRevenue,
  guildShareInput,
  participantCount,
}: SettlementCalcInput): SettlementCalcResult {
  assertNonNegativeMoney(totalRevenue)
  assertNonNegativeMoney(guildShareInput)

  const originalTotal = totalRevenue
  const normalizedGuildInput = normalizeMoneyInput(guildShareInput)
  const guildInputScrap = guildShareInput - normalizedGuildInput

  const distributableAmount = Math.max(0, originalTotal - normalizedGuildInput)
  const perPersonAmount = calcThousandRoundedPerPersonAmount(
    distributableAmount,
    participantCount,
  )
  const totalDistributed = perPersonAmount * participantCount
  const distributionRemainder = distributableAmount - totalDistributed
  const guildShareFinal = normalizedGuildInput + guildInputScrap + distributionRemainder

  const { ledgerAmount, subThousand } = guildShareLedgerAndSub(guildShareFinal)

  return {
    totalRevenue: originalTotal,
    guildShareInput: normalizedGuildInput,
    guildInputScrap,
    distributableAmount,
    perPersonAmount,
    remainder: distributionRemainder,
    guildShareFinal,
    totalDistributed,
    guildShareLedgerAmount: ledgerAmount,
    guildShareSubThousand: subThousand,
    roundingUnit: MONEY_ROUNDING_UNIT,
    roundingPolicy: MONEY_ROUNDING_POLICY,
  }
}

/** Phase 9a 이전 settlement revision용 — 1원 단위 floor (기존 row 불변). */
export function calcSettlementLegacy({
  totalRevenue,
  guildShareInput,
  participantCount,
}: SettlementCalcInput): SettlementCalcResult {
  const distributableAmount = Math.max(0, totalRevenue - guildShareInput)
  const perPersonAmount =
    participantCount > 0 ? Math.floor(distributableAmount / participantCount) : 0
  const totalDistributed = perPersonAmount * participantCount
  const remainder = distributableAmount - totalDistributed
  const guildShareFinal = guildShareInput + remainder

  return {
    totalRevenue,
    guildShareInput,
    guildInputScrap: 0,
    distributableAmount,
    perPersonAmount,
    remainder,
    guildShareFinal,
    totalDistributed,
    guildShareLedgerAmount: guildShareFinal,
    guildShareSubThousand: 0,
    roundingUnit: 1,
    roundingPolicy: "legacy_floor",
  }
}

export function calcSettlementForRevision(
  settlement: {
    roundingUnit?: number
    totalRevenue: number
    guildShareInput: number
    operationPolicySnapshot?: OperationPolicySnapshot
  },
  participantCount: number,
): SettlementCalcResult {
  if (settlement.operationPolicySnapshot) {
    const snap = settlement.operationPolicySnapshot
    return calcSettlementWithPolicy({
      totalRevenue: settlement.totalRevenue,
      participantCount,
      reserveMode: snap.reserveMode,
      reservePercentage: snap.reservePercentage,
      reserveManualInput: snap.reserveManualInput,
      managementFeeMode: snap.managementFeeMode,
      managementFeePercentage: snap.managementFeePercentage,
      managementFeeManualInput: snap.managementFeeManualInput,
      allocations: snap.managementAllocations.map((a) => ({
        memberId: a.memberId,
        nickname: a.nickname,
        ratioBp: a.ratioBp,
      })),
    })
  }

  if (settlement.roundingUnit == null || settlement.roundingUnit <= 1) {
    return calcSettlementLegacy({
      totalRevenue: settlement.totalRevenue,
      guildShareInput: settlement.guildShareInput,
      participantCount,
    })
  }
  return calcSettlement({
    totalRevenue: settlement.totalRevenue,
    guildShareInput: settlement.guildShareInput,
    participantCount,
  })
}

export function getGuildShareSubThousand(guildShareFinal: number): number {
  return subThousandRemainder(guildShareFinal)
}

export function isSettlementComplete(adminPaid: boolean, memberReceived: boolean): boolean {
  return adminPaid && memberReceived
}
