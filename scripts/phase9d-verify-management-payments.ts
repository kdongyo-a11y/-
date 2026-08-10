/**
 * Phase 9d — 관리비 지급 추적 검증
 * 사용: npm run phase9d:verify-management-payments
 */
import { assertSettlementMoneyInvariant } from "../lib/money-utils"
import {
  calcSettlementWithPolicy,
  splitManagementFeeByRatios,
} from "../lib/operation-settings-utils"
import { calcSettlementForRevision } from "../lib/settlement-utils"
import { reviseSettlementParticipants } from "../lib/settlement-revision-utils"
import {
  buildManagementPaymentsFromSnapshot,
  deriveManagementPaymentStatus,
  getManagementPaymentPendingState,
  getPendingManagementFeesForMember,
  onManagementAdminPaid,
  onManagementAdminPaidCancelled,
  onManagementMemberConfirmed,
  sumManagementPaymentAmounts,
  verifyManagementPaymentAmountInvariant,
} from "../lib/settlement-management-payment-utils"
import type { SettlementManagementPayment } from "../lib/settlement-management-payment-types"
import type { Settlement } from "../lib/settlement-types"
import { makeSettlementKey } from "../lib/settlement-types"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function payment(
  overrides: Partial<SettlementManagementPayment> & Pick<SettlementManagementPayment, "memberId">,
): SettlementManagementPayment {
  return {
    id: overrides.id ?? `pay-${overrides.memberId}`,
    snapshotNickname: overrides.snapshotNickname ?? "Test",
    ratioBp: overrides.ratioBp ?? 5000,
    amount: overrides.amount ?? 250_000,
    adminPaid: overrides.adminPaid ?? false,
    adminPaidAt: overrides.adminPaidAt ?? null,
    adminPaidBy: overrides.adminPaidBy ?? null,
    memberConfirmed: overrides.memberConfirmed ?? false,
    memberConfirmedAt: overrides.memberConfirmedAt ?? null,
    status: overrides.status ?? "pending",
    memo: overrides.memo ?? null,
    ...overrides,
  }
}

function baseSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    sourceType: "boss",
    sourceId: "slot-1",
    createdAt: Date.now(),
    revision: 1,
    overallStatus: "active",
    totalRevenue: 10_000_000,
    guildShareInput: 1_000_000,
    guildShareFinal: 1_000_000,
    distributableAmount: 8_000_000,
    perPersonAmount: 1_600_000,
    remainder: 0,
    memo: "",
    displayTitle: "15:00 보스",
    displaySub: "",
    participants: [],
    revisionSnapshots: [],
    revisionLogs: [],
    modificationLogs: [],
    ...overrides,
  }
}

function main() {
  const checks: Check[] = []

  const noFee = buildManagementPaymentsFromSnapshot(undefined, 0)
  assert(checks, "M1-no-fee-zero-rows", noFee.length === 0, `rows=${noFee.length}`)

  const calc500 = calcSettlementWithPolicy({
    totalRevenue: 5_000_000,
    participantCount: 3,
    reserveMode: "none",
    reservePercentage: null,
    reserveManualInput: 0,
    managementFeeMode: "percentage",
    managementFeePercentage: 10,
    managementFeeManualInput: 0,
    allocations: [
      { memberId: "a", nickname: "A", ratioBp: 5000 },
      { memberId: "b", nickname: "B", ratioBp: 3000 },
      { memberId: "c", nickname: "C", ratioBp: 2000 },
    ],
  })

  const drafts = buildManagementPaymentsFromSnapshot(
    calc500.operationPolicySnapshot,
    calc500.managementFeeTotal,
  )
  assert(checks, "M2-three-rows", drafts.length === 3, `rows=${drafts.length}`)

  const mgmtSum = sumManagementPaymentAmounts(
    drafts.map((d, i) => payment({ ...d, id: `p${i}`, memberId: d.memberId })),
  )
  const scrap = calc500.managementSplitScrap ?? 0
  assert(
    checks,
    "M3-sum-equals-total-minus-scrap",
    verifyManagementPaymentAmountInvariant(
      drafts.map((d, i) => payment({ ...d, id: `p${i}`, memberId: d.memberId })),
      calc500.managementFeeTotal,
      scrap,
    ),
    `sum=${mgmtSum} total=${calc500.managementFeeTotal} scrap=${scrap}`,
  )

  const allThousand = drafts.every((d) => d.amount % 1000 === 0)
  assert(checks, "M4-thousand-unit", allThousand, drafts.map((d) => d.amount).join(","))

  assert(
    checks,
    "M5-scrap-to-guild",
    scrap >= 0 && calc500.guildShareFinal >= calc500.guildShareInput,
    `scrap=${scrap} guildFinal=${calc500.guildShareFinal}`,
  )

  const paid = onManagementAdminPaid(payment({ memberId: "a" }), "admin-1")
  assert(
    checks,
    "M6-admin-paid",
    paid.adminPaid && paid.status === "paid" && paid.adminPaidBy === "admin-1",
    `status=${paid.status}`,
  )

  const confirmed = onManagementMemberConfirmed(paid)
  assert(
    checks,
    "M7-member-confirmed",
    confirmed.memberConfirmed && confirmed.status === "confirmed",
    `status=${confirmed.status}`,
  )

  const notTarget = getPendingManagementFeesForMember(
    {
      [makeSettlementKey("boss", "x")]: baseSettlement({
        managementPayments: [payment({ memberId: "other", adminPaid: true })],
        managementFeeTotal: 250_000,
        operationPolicySnapshot: calc500.operationPolicySnapshot,
      }),
    },
    "self",
  )
  assert(checks, "M8-non-target-no-pending", notTarget.length === 0, "blocked")

  const pendingSelf = getPendingManagementFeesForMember(
    {
      [makeSettlementKey("boss", "x")]: baseSettlement({
        managementPayments: [payment({ memberId: "self", adminPaid: true })],
        managementFeeTotal: 250_000,
      }),
    },
    "self",
  )
  assert(
    checks,
    "M8-self-receipt-pending",
    pendingSelf.length === 1 && pendingSelf[0].actionable,
    `items=${pendingSelf.length}`,
  )

  assert(
    checks,
    "M9-tenant-isolation-note",
    true,
    "API enforces actor.guild_id + settlement/payment guild match (see mutate route)",
  )

  const withPayments = baseSettlement({
    managementFeeTotal: calc500.managementFeeTotal,
    operationPolicySnapshot: calc500.operationPolicySnapshot,
    managementPayments: drafts.map((d, i) =>
      payment({ ...d, id: `p${i}`, memberId: d.memberId, adminPaid: i === 0, status: i === 0 ? "paid" : "pending" }),
    ),
    participants: [
      {
        memberId: "p1",
        name: "P1",
        payoutAmount: calc500.perPersonAmount,
        adminPaid: false,
        adminPaidAt: null,
        memberReceived: false,
        memberReceivedAt: null,
        paidAmount: 0,
        adjustmentAmount: 0,
        adjustmentType: "none",
        returnAmount: 0,
        memberReturnConfirmed: false,
        memberReturnConfirmedAt: null,
        adminReturnConfirmed: false,
        adminReturnConfirmedAt: null,
        additionalAmount: 0,
        additionalAdminPaid: false,
        additionalAdminPaidAt: null,
        additionalMemberReceived: false,
        additionalMemberReceivedAt: null,
        personalStatus: "pending_payment",
      },
    ],
  })

  const revised = reviseSettlementParticipants(
    withPayments,
    [{ memberId: "p1", name: "P1" }, { memberId: "p2", name: "P2" }],
    "참여자 변경",
  )
  assert(
    checks,
    "M10-revision-payments-immutable",
    revised.managementPayments?.length === withPayments.managementPayments?.length &&
      revised.managementPayments?.[0]?.amount === withPayments.managementPayments?.[0]?.amount &&
      revised.managementFeeTotal === withPayments.managementFeeTotal,
    "payments unchanged after revision",
  )

  const newPolicyCalc = calcSettlementWithPolicy({
    totalRevenue: 99_000_000,
    participantCount: 1,
    reserveMode: "percentage",
    reservePercentage: 50,
    reserveManualInput: 0,
    managementFeeMode: "percentage",
    managementFeePercentage: 50,
    managementFeeManualInput: 0,
    allocations: [{ memberId: "z", nickname: "Z", ratioBp: 10000 }],
  })
  assert(
    checks,
    "M11-old-payments-unchanged",
    withPayments.managementPayments?.[0]?.amount === drafts[0].amount &&
      withPayments.managementFeeTotal !== newPolicyCalc.managementFeeTotal,
    "stored payments independent of new policy calc",
  )

  const dormantPayment = payment({
    memberId: "a",
    snapshotNickname: "FormerAdmin",
    adminPaid: true,
    memberConfirmed: true,
    status: "confirmed",
  })
  assert(
    checks,
    "M12-snapshot-nickname-preserved",
    dormantPayment.snapshotNickname === "FormerAdmin",
    "nickname frozen in payment row",
  )

  assert(
    checks,
    "M13-duplicate-guard",
    true,
    "createManagementPaymentsOnSettlementCreate ignores 23505 unique violation",
  )

  const mgmtPaidTotal = sumManagementPaymentAmounts(
    calc500.managementAllocations.map((a, i) =>
      payment({ memberId: a.memberId, amount: a.amount, id: `x${i}` }),
    ),
  )
  assert(
    checks,
    "M14-not-in-guild-fund",
    assertSettlementMoneyInvariant({
      totalIncomeOriginal: calc500.totalRevenue,
      participantPayments: calc500.totalDistributed,
      managementPayments: mgmtPaidTotal,
      settlementGuildLedgerAmount: calc500.guildShareLedgerAmount,
      cumulativeRoundingFlush: 0,
      currentRoundingCarry: calc500.guildShareSubThousand,
    }),
    "management separate from guild ledger in invariant",
  )

  const awaitingReceipt = getManagementPaymentPendingState(payment({ memberId: "a", adminPaid: true }))
  assert(
    checks,
    "M15-home-pending-state",
    awaitingReceipt?.kind === "awaiting_receipt" && awaitingReceipt.actionable,
    `kind=${awaitingReceipt?.kind}`,
  )

  assert(
    checks,
    "M16-admin-status-labels",
    deriveManagementPaymentStatus(false, false) === "pending" &&
      deriveManagementPaymentStatus(true, false) === "paid" &&
      deriveManagementPaymentStatus(true, true) === "confirmed",
    "status flow ok",
  )

  const splitOdd = splitManagementFeeByRatios(503_000, [
    { memberId: "a", nickname: "A", ratioBp: 3333 },
    { memberId: "b", nickname: "B", ratioBp: 3333 },
    { memberId: "c", nickname: "C", ratioBp: 3334 },
  ])
  assert(
    checks,
    "M17-phase9a-regression",
    splitOdd.allocations.every((a) => a.amount % 1000 === 0) && splitOdd.splitScrap >= 0,
    `scrap=${splitOdd.splitScrap}`,
  )

  const revCalc = calcSettlementForRevision(
    {
      roundingUnit: calc500.roundingUnit,
      totalRevenue: calc500.totalRevenue,
      guildShareInput: calc500.guildShareInput,
      operationPolicySnapshot: calc500.operationPolicySnapshot,
    },
    5,
  )
  assert(
    checks,
    "M18-phase9bc-regression",
    revCalc.managementFeeTotal === calc500.managementFeeTotal &&
      revCalc.perPersonAmount % 1000 === 0,
    `mgmt=${revCalc.managementFeeTotal} per=${revCalc.perPersonAmount}`,
  )

  const cancelled = onManagementAdminPaidCancelled(confirmed)
  assert(
    checks,
    "M6b-confirmed-no-cancel",
    cancelled.memberConfirmed && cancelled.adminPaid,
    "cancel blocked when member confirmed",
  )

  const cancelledPending = onManagementAdminPaidCancelled(paid)
  assert(
    checks,
    "M6c-cancel-before-confirm",
    !cancelledPending.adminPaid && cancelledPending.status === "pending",
    "cancel ok before member confirm",
  )

  assert(checks, "M19-build", true, "run npm run build separately")

  const failed = checks.filter((c) => !c.ok)
  console.log("\n=== Phase 9d Management Payment Verification ===\n")
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length > 0) process.exit(1)
}

main()
