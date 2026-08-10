import {
  MONEY_ROUNDING_POLICY,
  MONEY_ROUNDING_UNIT,
  calcThousandRoundedPerPersonAmount,
  floorToThousand,
  guildShareLedgerAndSub,
  normalizeMoneyInput,
  resolvePercentageReserveAmount,
} from "@/lib/money-utils"
import type {
  ManagementFeeAllocation,
  OperationPolicySnapshot,
  PolicyAmountMode,
} from "@/lib/operation-settings-types"
import { RATIO_BP_TOTAL } from "@/lib/operation-settings-types"

export type PolicyAmountResolveInput = {
  mode: PolicyAmountMode
  percentage: number | null
  manualInput: number
  totalRevenue: number
}

export type PolicyAmountResolveResult = {
  normalizedAmount: number
  scrap: number
}

export function resolvePolicyAmount(input: PolicyAmountResolveInput): PolicyAmountResolveResult {
  const { mode, percentage, manualInput, totalRevenue } = input

  if (mode === "none") {
    return { normalizedAmount: 0, scrap: 0 }
  }

  if (mode === "percentage") {
    const pct = percentage ?? 0
    const { reserveAmount, reserveRemainder } = resolvePercentageReserveAmount(totalRevenue, pct)
    return { normalizedAmount: reserveAmount, scrap: reserveRemainder }
  }

  const normalizedAmount = normalizeMoneyInput(manualInput)
  return { normalizedAmount, scrap: Math.max(0, manualInput - normalizedAmount) }
}

export function splitManagementFeeByRatios(
  feeTotal: number,
  allocations: Array<{ memberId: string; nickname: string; ratioBp: number }>,
): { allocations: ManagementFeeAllocation[]; splitScrap: number } {
  if (feeTotal <= 0 || allocations.length === 0) {
    return {
      allocations: allocations.map((a) => ({ ...a, amount: 0 })),
      splitScrap: 0,
    }
  }

  let assigned = 0
  const result: ManagementFeeAllocation[] = allocations.map((a) => {
    const raw = Math.floor((feeTotal * a.ratioBp) / RATIO_BP_TOTAL)
    const amount = floorToThousand(raw)
    assigned += amount
    return { ...a, amount }
  })

  return { allocations: result, splitScrap: feeTotal - assigned }
}

export type SettlementWithPolicyInput = {
  totalRevenue: number
  participantCount: number
  reserveMode: PolicyAmountMode
  reservePercentage: number | null
  reserveManualInput: number
  managementFeeMode: PolicyAmountMode
  managementFeePercentage: number | null
  managementFeeManualInput: number
  allocations: Array<{ memberId: string; nickname: string; ratioBp: number }>
}

export type SettlementWithPolicyResult = {
  totalRevenue: number
  guildShareInput: number
  guildInputScrap: number
  managementFeeTotal: number
  managementFeeScrap: number
  managementSplitScrap: number
  managementAllocations: ManagementFeeAllocation[]
  distributableAmount: number
  perPersonAmount: number
  remainder: number
  guildShareFinal: number
  totalDistributed: number
  guildShareLedgerAmount: number
  guildShareSubThousand: number
  roundingUnit: number
  roundingPolicy: string
  operationPolicySnapshot: OperationPolicySnapshot
}

export function calcSettlementWithPolicy(input: SettlementWithPolicyInput): SettlementWithPolicyResult {
  const originalTotal = input.totalRevenue

  const reserve = resolvePolicyAmount({
    mode: input.reserveMode,
    percentage: input.reservePercentage,
    manualInput: input.reserveManualInput,
    totalRevenue: originalTotal,
  })

  const management = resolvePolicyAmount({
    mode: input.managementFeeMode,
    percentage: input.managementFeePercentage,
    manualInput: input.managementFeeManualInput,
    totalRevenue: originalTotal,
  })

  const { allocations: managementAllocations, splitScrap: managementSplitScrap } =
    splitManagementFeeByRatios(management.normalizedAmount, input.allocations)

  const distributableAmount = Math.max(
    0,
    originalTotal - reserve.normalizedAmount - management.normalizedAmount,
  )
  const perPersonAmount = calcThousandRoundedPerPersonAmount(
    distributableAmount,
    input.participantCount,
  )
  const totalDistributed = perPersonAmount * input.participantCount
  const distributionRemainder = distributableAmount - totalDistributed

  const guildShareFinal =
    reserve.normalizedAmount +
    reserve.scrap +
    management.scrap +
    managementSplitScrap +
    distributionRemainder

  const { ledgerAmount, subThousand } = guildShareLedgerAndSub(guildShareFinal)

  const operationPolicySnapshot: OperationPolicySnapshot = {
    reserveMode: input.reserveMode,
    reservePercentage: input.reservePercentage,
    reserveManualInput: input.reserveManualInput,
    managementFeeMode: input.managementFeeMode,
    managementFeePercentage: input.managementFeePercentage,
    managementFeeManualInput: input.managementFeeManualInput,
    managementFeeTotal: management.normalizedAmount,
    managementAllocations,
  }

  return {
    totalRevenue: originalTotal,
    guildShareInput: reserve.normalizedAmount,
    guildInputScrap: reserve.scrap,
    managementFeeTotal: management.normalizedAmount,
    managementFeeScrap: management.scrap,
    managementSplitScrap,
    managementAllocations,
    distributableAmount,
    perPersonAmount,
    remainder: distributionRemainder,
    guildShareFinal,
    totalDistributed,
    guildShareLedgerAmount: ledgerAmount,
    guildShareSubThousand: subThousand,
    roundingUnit: MONEY_ROUNDING_UNIT,
    roundingPolicy: MONEY_ROUNDING_POLICY,
    operationPolicySnapshot,
  }
}

export function isValidPolicyAmountMode(value: unknown): value is PolicyAmountMode {
  return value === "none" || value === "percentage" || value === "manual_per_settlement"
}

export function isValidPercentage(value: unknown): boolean {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 100
}

export function validateAllocationRatios(
  allocations: Array<{ ratioBp: number }>,
  managementFeeMode: PolicyAmountMode,
): { ok: true } | { ok: false; message: string } {
  if (managementFeeMode === "none") {
    return { ok: true }
  }

  if (allocations.length === 0) {
    return { ok: false, message: "관리비 수령 대상을 1명 이상 선택해주세요." }
  }

  for (const a of allocations) {
    if (!Number.isInteger(a.ratioBp) || a.ratioBp <= 0 || a.ratioBp > RATIO_BP_TOTAL) {
      return { ok: false, message: "배분 비율은 1~10000bp 사이 정수여야 합니다." }
    }
  }

  const sum = allocations.reduce((acc, a) => acc + a.ratioBp, 0)
  if (sum !== RATIO_BP_TOTAL) {
    return {
      ok: false,
      message: `관리비 배분 비율 합계는 10000bp(100%)여야 합니다. (현재 ${sum}bp)`,
    }
  }

  return { ok: true }
}

export function validateOperationSettingsInput(input: {
  managementFeeMode: PolicyAmountMode
  managementFeePercentage: number | null
  reserveMode: PolicyAmountMode
  reservePercentage: number | null
  allocations: Array<{ ratioBp: number }>
}): { ok: true } | { ok: false; message: string } {
  if (
    input.managementFeeMode === "percentage" &&
    !isValidPercentage(input.managementFeePercentage ?? 0)
  ) {
    return { ok: false, message: "관리비 비율은 0~100 사이여야 합니다." }
  }

  if (input.reserveMode === "percentage" && !isValidPercentage(input.reservePercentage ?? 0)) {
    return { ok: false, message: "혈맹 비축 비율은 0~100 사이여야 합니다." }
  }

  return validateAllocationRatios(input.allocations, input.managementFeeMode)
}

export const DEFAULT_GUILD_OPERATION_SETTINGS = {
  managementFeeMode: "none" as PolicyAmountMode,
  managementFeePercentage: null as number | null,
  reserveMode: "manual_per_settlement" as PolicyAmountMode,
  reservePercentage: null as number | null,
  allocations: [] as Array<{ memberId: string; nickname: string; ratioBp: number }>,
}
