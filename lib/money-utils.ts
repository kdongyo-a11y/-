/** Phase 9a — 1,000원 단위 절사. 절사 짜투리는 혈맹 귀속(carry)으로 처리. */
export const MONEY_ROUNDING_UNIT = 1000

export const MONEY_ROUNDING_POLICY = "floor_to_guild" as const

export type MoneyRoundingPolicy = typeof MONEY_ROUNDING_POLICY

export type ThousandSplit = {
  roundedAmount: number
  remainder: number
}

export type CarryReconcileResult = {
  carry: number
  flushLedgerTotal: number
  flushDelta: number
  reverseDelta: number
}

export class InvalidMoneyAmountError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidMoneyAmountError"
  }
}

export class InvalidCarryStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InvalidCarryStateError"
  }
}

export function assertNonNegativeMoney(amount: number, label = "amount"): void {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new InvalidMoneyAmountError(`${label} must be a non-negative finite number`)
  }
}

/** Math.floor(amount / 1000) * 1000 */
export function floorToThousand(amount: number): number {
  assertNonNegativeMoney(amount)
  if (amount < MONEY_ROUNDING_UNIT) return 0
  return Math.floor(amount / MONEY_ROUNDING_UNIT) * MONEY_ROUNDING_UNIT
}

/** roundedAmount + remainder === original amount (remainder in [0, 999]). */
export function splitThousandRemainder(amount: number): ThousandSplit {
  assertNonNegativeMoney(amount)
  const roundedAmount = floorToThousand(amount)
  return {
    roundedAmount,
    remainder: amount - roundedAmount,
  }
}

/** 1,000원 미만 sub-thousand portion (0–999). */
export function subThousandRemainder(amount: number): number {
  return splitThousandRemainder(amount).remainder
}

/** manual guildShareInput 등 자동 계산 결과값에 적용하는 1,000원 절사. */
export function normalizeMoneyInput(amount: number): number {
  return floorToThousand(amount)
}

export function guildShareLedgerAndSub(guildShareFinal: number): {
  ledgerAmount: number
  subThousand: number
} {
  const split = splitThousandRemainder(guildShareFinal)
  return {
    ledgerAmount: split.roundedAmount,
    subThousand: split.remainder,
  }
}

/**
 * carry pool에서 1,000원 이상 flush / 음수 시 flush ledger 역반영.
 * carry는 항상 [0, 999]로 수렴 (불가능하면 throw).
 */
export function reconcileCarryBalance(
  carryBalance: number,
  flushLedgerTotal: number,
): CarryReconcileResult {
  if (!Number.isFinite(carryBalance)) {
    throw new InvalidMoneyAmountError("carry must be a finite number")
  }
  assertNonNegativeMoney(flushLedgerTotal)

  let carry = carryBalance
  let flushLedger = flushLedgerTotal
  let flushDelta = 0
  let reverseDelta = 0

  while (carry >= MONEY_ROUNDING_UNIT) {
    carry -= MONEY_ROUNDING_UNIT
    flushLedger += MONEY_ROUNDING_UNIT
    flushDelta += MONEY_ROUNDING_UNIT
  }

  while (carry < 0) {
    if (flushLedger <= 0) {
      throw new InvalidCarryStateError(
        `carry underflow (${carry}) with no flush ledger to reverse`,
      )
    }
    const reverse = Math.min(MONEY_ROUNDING_UNIT, flushLedger)
    carry += reverse
    flushLedger -= reverse
    reverseDelta += reverse
  }

  if (carry >= MONEY_ROUNDING_UNIT) {
    throw new InvalidCarryStateError("carry reconcile failed to converge below 1000")
  }

  return { carry, flushLedgerTotal: flushLedger, flushDelta, reverseDelta }
}

/**
 * settlement sub-thousand 기여분 delta만 carry pool에 반영.
 * settlement ledger(thousand part)와 역할 분리 — 이중 반영 방지.
 */
export function applySubThousandCarryDelta(
  carryBalance: number,
  flushLedgerTotal: number,
  prevSubThousand: number,
  nextSubThousand: number,
): CarryReconcileResult {
  assertNonNegativeMoney(carryBalance)
  assertNonNegativeMoney(flushLedgerTotal)
  assertNonNegativeMoney(prevSubThousand)
  assertNonNegativeMoney(nextSubThousand)

  const carryAfterDelta = carryBalance - prevSubThousand + nextSubThousand
  return reconcileCarryBalance(carryAfterDelta, flushLedgerTotal)
}

/** @deprecated use applySubThousandCarryDelta */
export function adjustCarryForGuildShareChange(
  carryBalance: number,
  prevGuildShareFinal: number,
  nextGuildShareFinal: number,
): { carry: number; flushAmount: number } {
  const result = applySubThousandCarryDelta(
    carryBalance,
    0,
    subThousandRemainder(prevGuildShareFinal),
    subThousandRemainder(nextGuildShareFinal),
  )
  return { carry: result.carry, flushAmount: result.flushDelta }
}

/**
 * Phase 9 percentage reserve 등 자동 계산 reserve용 (관리비/기여도 분배 재사용).
 * reserveAmount는 1,000원 단위, reserveRemainder는 혈맹 귀속 짜투리.
 */
export function resolvePercentageReserveAmount(
  totalRevenue: number,
  percentage: number,
): {
  rawAmount: number
  reserveAmount: number
  reserveRemainder: number
} {
  assertNonNegativeMoney(totalRevenue)
  if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new InvalidMoneyAmountError("percentage must be between 0 and 100")
  }
  const rawAmount = Math.floor((totalRevenue * percentage) / 100)
  const { roundedAmount, remainder } = splitThousandRemainder(rawAmount)
  return {
    rawAmount,
    reserveAmount: roundedAmount,
    reserveRemainder: remainder,
  }
}

/** per-participant payout — distributable / count 를 1,000원 단위 절사. */
export function calcThousandRoundedPerPersonAmount(
  distributableAmount: number,
  participantCount: number,
): number {
  assertNonNegativeMoney(distributableAmount)
  if (participantCount <= 0) return 0
  return floorToThousand(distributableAmount / participantCount)
}

export const ROUNDING_CARRY_LEDGER_SOURCE_ID = "rounding_carry_flush"

/** 신규 settlement 회계 불변식 검증 (managementPayments=0). */
export function assertSettlementMoneyInvariant(input: {
  totalIncomeOriginal: number
  participantPayments: number
  managementPayments?: number
  settlementGuildLedgerAmount: number
  cumulativeRoundingFlush: number
  currentRoundingCarry: number
}): boolean {
  const management = input.managementPayments ?? 0
  const lhs = input.totalIncomeOriginal
  const rhs =
    input.participantPayments +
    management +
    input.settlementGuildLedgerAmount +
    input.cumulativeRoundingFlush +
    input.currentRoundingCarry
  return lhs === rhs
}
