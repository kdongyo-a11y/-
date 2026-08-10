/**
 * Phase 9b — 운영 정책 / 관리비 배분 검증
 * 사용: npm run phase9b:verify-operation-settings
 */
import { assertSettlementMoneyInvariant } from "../lib/money-utils"
import {
  calcSettlementWithPolicy,
  splitManagementFeeByRatios,
  validateAllocationRatios,
  validateOperationSettingsInput,
} from "../lib/operation-settings-utils"
import { calcSettlementForRevision } from "../lib/settlement-utils"
import type { OperationPolicySnapshot } from "../lib/operation-settings-types"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function main() {
  const checks: Check[] = []

  const ratioBad = validateAllocationRatios(
    [{ ratioBp: 6000 }, { ratioBp: 3000 }],
    "percentage",
  )
  assert(checks, "B1-ratio-sum", !ratioBad.ok, ratioBad.ok ? "should fail" : ratioBad.message)

  const ratioOk = validateAllocationRatios(
    [{ ratioBp: 6000 }, { ratioBp: 4000 }],
    "percentage",
  )
  assert(checks, "B1-ratio-ok", ratioOk.ok, "6000+4000=10000")

  const noneMode = validateAllocationRatios([], "none")
  assert(checks, "B1-none-mode", noneMode.ok, "none mode skips allocations")

  const settingsOk = validateOperationSettingsInput({
    managementFeeMode: "percentage",
    managementFeePercentage: 10,
    reserveMode: "percentage",
    reservePercentage: 5,
    allocations: [{ ratioBp: 10000 }],
  })
  assert(checks, "B2-settings-valid", settingsOk.ok, "valid settings")

  const split = splitManagementFeeByRatios(1_000_000, [
    { memberId: "a", nickname: "A", ratioBp: 6000 },
    { memberId: "b", nickname: "B", ratioBp: 4000 },
  ])
  assert(
    checks,
    "B3-split-thousand",
    split.allocations[0].amount === 600_000 && split.allocations[1].amount === 400_000,
    `600k+400k scrap=${split.splitScrap}`,
  )

  const calc = calcSettlementWithPolicy({
    totalRevenue: 10_000_000,
    participantCount: 5,
    reserveMode: "percentage",
    reservePercentage: 10,
    reserveManualInput: 0,
    managementFeeMode: "percentage",
    managementFeePercentage: 10,
    managementFeeManualInput: 0,
    allocations: [
      { memberId: "admin", nickname: "Admin", ratioBp: 7000 },
      { memberId: "mgr", nickname: "Mgr", ratioBp: 3000 },
    ],
  })

  assert(checks, "B4-reserve-10pct", calc.guildShareInput === 1_000_000, `reserve=${calc.guildShareInput}`)
  assert(checks, "B4-mgmt-10pct", calc.managementFeeTotal === 1_000_000, `mgmt=${calc.managementFeeTotal}`)
  assert(
    checks,
    "B4-distributable",
    calc.distributableAmount === 8_000_000,
    `dist=${calc.distributableAmount}`,
  )
  assert(
    checks,
    "B4-per-person-thousand",
    calc.perPersonAmount === 1_600_000 && calc.perPersonAmount % 1000 === 0,
    `per=${calc.perPersonAmount}`,
  )

  const mgmtPaid = calc.managementAllocations.reduce((s, a) => s + a.amount, 0)
  assert(
    checks,
    "B4-invariant",
    assertSettlementMoneyInvariant({
      totalIncomeOriginal: calc.totalRevenue,
      participantPayments: calc.totalDistributed,
      managementPayments: mgmtPaid,
      settlementGuildLedgerAmount: calc.guildShareLedgerAmount,
      cumulativeRoundingFlush: 0,
      currentRoundingCarry: calc.guildShareSubThousand,
    }),
    `total=${calc.totalRevenue} mgmt=${mgmtPaid} guild=${calc.guildShareLedgerAmount}`,
  )

  const snap: OperationPolicySnapshot = calc.operationPolicySnapshot
  const revised = calcSettlementForRevision(
    {
      roundingUnit: calc.roundingUnit,
      totalRevenue: calc.totalRevenue,
      guildShareInput: calc.guildShareInput,
      operationPolicySnapshot: snap,
    },
    6,
  )
  assert(
    checks,
    "B5-revision-freeze-policy",
    revised.managementFeeTotal === calc.managementFeeTotal &&
      revised.guildShareInput === calc.guildShareInput,
    "fee+reserve frozen on revision",
  )

  const manual = calcSettlementWithPolicy({
    totalRevenue: 5_000_000,
    participantCount: 3,
    reserveMode: "manual_per_settlement",
    reservePercentage: null,
    reserveManualInput: 500_500,
    managementFeeMode: "manual_per_settlement",
    managementFeePercentage: null,
    managementFeeManualInput: 200_200,
    allocations: [{ memberId: "m1", nickname: "M1", ratioBp: 10000 }],
  })
  assert(
    checks,
    "B6-manual-floor",
    manual.guildShareInput === 500_000 && manual.managementFeeTotal === 200_000,
    `reserve=${manual.guildShareInput} mgmt=${manual.managementFeeTotal}`,
  )

  const noneReserve = calcSettlementWithPolicy({
    totalRevenue: 3_000_000,
    participantCount: 2,
    reserveMode: "none",
    reservePercentage: null,
    reserveManualInput: 0,
    managementFeeMode: "none",
    managementFeePercentage: null,
    managementFeeManualInput: 0,
    allocations: [],
  })
  assert(checks, "B7-none-modes", noneReserve.guildShareInput === 0 && noneReserve.managementFeeTotal === 0, "none modes")

  const passed = checks.filter((c) => c.ok).length
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9b operation settings: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main()
