/**
 * Finance 2.0-A — aggregation / checkpoint / receipt unit verify
 * npm run finance2a:verify-summary
 */
import {
  computeCashBalance,
  isOnOrAfterCheckpointCutoff,
  selectLatestCheckpoint,
} from "../lib/guild-cash-utils"
import { computeFinanceSummary } from "../lib/finance-summary-utils"
import type { GuildCashCheckpoint, GuildCashMovement } from "../lib/guild-cash-types"
import {
  validateRevisionAgainstReceipts,
  validateRevenueReceiptAmount,
} from "../lib/settlement-revenue-receipt-utils"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function cp(id: string, effectiveAt: string, opening: number): GuildCashCheckpoint {
  return {
    id,
    guildId: "g1",
    effectiveAt,
    openingCashBalance: opening,
    createdBy: null,
    memo: "",
    createdAt: effectiveAt,
  }
}

function mv(
  id: string,
  movementAt: string,
  direction: "in" | "out",
  amount: number,
  cancelled = false,
): GuildCashMovement {
  return {
    id,
    guildId: "g1",
    movementAt,
    direction,
    amount,
    category: "revenue_received",
    sourceType: "settlement_revenue_receipt",
    sourceId: id,
    description: "",
    createdBy: null,
    cancelled,
    createdAt: movementAt,
  }
}

function main() {
  const checks: Check[] = []

  const t1 = "2026-08-01T00:00:00.000Z"
  const t2 = "2026-08-05T12:00:00.000Z"
  const t3 = "2026-08-10T00:00:00.000Z"
  const t4 = "2026-08-11T09:00:00.000Z"

  const checkpoint1 = cp("cp1", t1, 1_000_000)
  const checkpoint2 = cp("cp2", t3, 2_000_000)
  const movements = [
    mv("m1", t2, "in", 500_000),
    mv("m2", t4, "in", 300_000),
  ]

  assert(
    checks,
    "F1-checkpoint-baseline-only",
    computeCashBalance(checkpoint1, []) === 1_000_000,
    `got ${computeCashBalance(checkpoint1, [])}`,
  )

  assert(
    checks,
    "F2-movements-after-checkpoint1",
    computeCashBalance(checkpoint1, [movements[0]]) === 1_500_000,
    `got ${computeCashBalance(checkpoint1, [movements[0]])}`,
  )

  assert(
    checks,
    "F3-rebaseline-excludes-pre-checkpoint-movements",
    computeCashBalance(checkpoint2, movements) === 2_300_000,
    `got ${computeCashBalance(checkpoint2, movements)} (expect 2M + 300k only)`,
  )

  assert(
    checks,
    "F4-cancelled-movement-excluded",
    computeCashBalance(checkpoint1, [mv("m3", t2, "in", 100_000, true)]) === 1_000_000,
    "cancelled",
  )

  assert(
    checks,
    "F5-latest-checkpoint-select",
    selectLatestCheckpoint([checkpoint1, checkpoint2], new Date(t4))?.id === "cp2",
    selectLatestCheckpoint([checkpoint1, checkpoint2], new Date(t4))?.id ?? "null",
  )

  assert(
    checks,
    "F6-no-checkpoint-cash-zero",
    computeCashBalance(null, movements) === 0,
    String(computeCashBalance(null, movements)),
  )

  const goLive = cp("go", t3, 5_000_000)
  const summary = computeFinanceSummary({
    checkpoint: goLive,
    movements: [mv("cash-in", t4, "in", 1_000_000)],
    settlements: [
      {
        settlementDbId: "s-old",
        sourceType: "boss",
        sourceId: "old",
        createdAtIso: t2,
        displayTitle: "과거 정산",
        displaySub: "",
        totalIncome: 10_000_000,
        receivedAmount: 0,
        revenueItems: [],
        receipts: [],
        participants: [
          {
            memberId: "m1",
            name: "A",
            payoutAmount: 1_000_000,
            paidAmount: 0,
            adminPaid: false,
            adjustmentType: "none",
            returnAmount: 0,
            memberReturnConfirmed: false,
            adminReturnConfirmed: false,
            additionalAmount: 0,
            additionalAdminPaid: false,
          },
        ],
        managementPayments: [],
      },
      {
        settlementDbId: "s-new",
        sourceType: "boss",
        sourceId: "new",
        createdAtIso: t4,
        displayTitle: "신규 정산",
        displaySub: "",
        totalIncome: 10_000_000,
        receivedAmount: 4_000_000,
        revenueItems: [],
        receipts: [],
        participants: [
          {
            memberId: "m2",
            name: "B",
            payoutAmount: 2_000_000,
            paidAmount: 0,
            adminPaid: false,
            adjustmentType: "none",
            returnAmount: 0,
            memberReturnConfirmed: false,
            adminReturnConfirmed: false,
            additionalAmount: 0,
            additionalAdminPaid: false,
          },
        ],
        managementPayments: [{ memberId: "mgr", snapshotNickname: "M", amount: 500_000, adminPaid: false }],
      },
    ],
    duesMembers: [
      {
        billId: "d-old",
        duesMonth: "2026-07",
        createdAtIso: t2,
        memberId: "m1",
        memberName: "A",
        amount: 300_000,
        status: "unpaid",
      },
      {
        billId: "d-new",
        duesMonth: "2026-08",
        createdAtIso: t4,
        memberId: "m2",
        memberName: "B",
        amount: 200_000,
        status: "unpaid",
      },
    ],
    openingBalance: 100,
    ledgerEntries: [],
    roundingRemainder: 125,
  })

  assert(
    checks,
    "F7-historical-settlement-excluded-from-revenue",
    summary.receivableBreakdown.revenue === 6_000_000,
    `revenue recv=${summary.receivableBreakdown.revenue}`,
  )

  assert(
    checks,
    "F8-historical-payables-excluded",
    summary.payableBreakdown.participant === 2_000_000,
    `participant payable=${summary.payableBreakdown.participant}`,
  )

  assert(
    checks,
    "F9-historical-dues-excluded",
    summary.receivableBreakdown.dues === 200_000,
    `dues=${summary.receivableBreakdown.dues}`,
  )

  assert(
    checks,
    "F10-available-fund-negative-allowed",
    summary.availableFund === summary.cashBalance - summary.payables,
    `available=${summary.availableFund} cash=${summary.cashBalance} pay=${summary.payables}`,
  )

  assert(
    checks,
    "F11-available-fund-not-clamped",
    summary.cashBalance === 6_000_000 && summary.payables === 2_500_000 && summary.availableFund === 3_500_000,
    `available=${summary.availableFund}`,
  )

  const negativeCase = computeFinanceSummary({
    checkpoint: cp("neg", t1, 5_000_000),
    movements: [],
    settlements: [
      {
        settlementDbId: "s1",
        sourceType: "boss",
        sourceId: "x",
        createdAtIso: t2,
        displayTitle: "T",
        displaySub: "",
        totalIncome: 1,
        receivedAmount: 0,
        revenueItems: [],
        receipts: [],
        participants: [
          {
            memberId: "m",
            name: "M",
            payoutAmount: 8_000_000,
            paidAmount: 0,
            adminPaid: false,
            adjustmentType: "none",
            returnAmount: 0,
            memberReturnConfirmed: false,
            adminReturnConfirmed: false,
            additionalAmount: 0,
            additionalAdminPaid: false,
          },
        ],
        managementPayments: [],
      },
    ],
    duesMembers: [],
    openingBalance: 0,
    ledgerEntries: [],
    roundingRemainder: 0,
  })

  assert(
    checks,
    "F12-negative-available-fund",
    negativeCase.availableFund === -3_000_000,
    String(negativeCase.availableFund),
  )

  assert(
    checks,
    "F13-projected-formula",
    summary.projectedAvailableFund === summary.cashBalance + summary.receivables - summary.payables,
    String(summary.projectedAvailableFund),
  )

  const receiptOk = validateRevenueReceiptAmount(10_000_000, [{ id: "r1", guildId: "g", settlementId: "s", amount: 6_000_000, receivedAt: t4, confirmedBy: null, memo: "", createdAt: t4 }], 4_000_000)
  assert(checks, "F14-partial-receipt-ok", receiptOk.ok, receiptOk.ok ? "ok" : receiptOk.message)

  const receiptBad = validateRevenueReceiptAmount(10_000_000, [{ id: "r1", guildId: "g", settlementId: "s", amount: 6_000_000, receivedAt: t4, confirmedBy: null, memo: "", createdAt: t4 }], 4_000_001)
  assert(checks, "F15-partial-receipt-reject-over-total", !receiptBad.ok, receiptBad.ok ? "unexpected ok" : "rejected")

  const revOk = validateRevisionAgainstReceipts(10_000_000, 6_000_000)
  assert(checks, "F16-revision-guard-ok", revOk.ok, "ok")

  const revBad = validateRevisionAgainstReceipts(5_000_000, 6_000_000)
  assert(checks, "F17-revision-guard-reject", !revBad.ok, revBad.ok ? "unexpected ok" : revBad.message)

  assert(
    checks,
    "F18-cutoff-boundary",
    isOnOrAfterCheckpointCutoff(t3, goLive) && !isOnOrAfterCheckpointCutoff(t2, goLive),
    `t3=${isOnOrAfterCheckpointCutoff(t3, goLive)} t2=${isOnOrAfterCheckpointCutoff(t2, goLive)}`,
  )

  assert(
    checks,
    "F19-no-checkpoint-cutoff-false",
    !isOnOrAfterCheckpointCutoff(t4, null),
    "should be false",
  )

  assert(
    checks,
    "F20-return-receivable-not-in-payables",
    summary.payableBreakdown.participant === 2_000_000 && summary.receivableBreakdown.return === 0,
    "return separate",
  )

  const failed = checks.filter((c) => !c.ok)
  console.log("\n=== Finance 2.0-A Summary Verify ===\n")
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length > 0) process.exit(1)
}

main()
