/**
 * Finance 2.0-A+ — revenue item validation / edit policy / queue invariant
 * npm run finance2aplus:verify
 */
import { computeFinanceSummary } from "../lib/finance-summary-utils"
import {
  applyRevenueItemAmountBatch,
  applyRevenueItemMetadataUpdates,
  applyRevenueItemUpdates,
  canChangeRevenueItemAmount,
  validateRevenueItemsForTotalIncome,
  validateRevenueItemsInvariant,
} from "../lib/settlement-revenue-item-utils"
import {
  sortFinanceWorkItems,
  verifyQueueAggregateInvariant,
} from "../lib/finance-work-item-utils"
import {
  FINANCE_WORK_QUEUE_INLINE_MUTATIONS_ENABLED,
  getWorkQueueNavigateAction,
  isInlineWorkQueueMutationEnabled,
} from "../lib/finance-work-queue-actions"
import type { FinanceWorkItem } from "../lib/finance-summary-types"
import type { SettlementRevenueItem } from "../lib/settlement-revenue-item-types"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function sampleItem(overrides: Partial<SettlementRevenueItem> = {}): SettlementRevenueItem {
  return {
    id: "i1",
    guildId: "g1",
    settlementId: "s1",
    description: "보스 아이템",
    quantity: null,
    unitPrice: null,
    amount: 10_000_000,
    memo: "",
    sortOrder: 0,
    createdBy: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  }
}

function main() {
  const checks: Check[] = []

  assert(
    checks,
    "RI1-simple-amount-only",
    validateRevenueItemsForTotalIncome(10_000_000, [
      { description: "보스 아이템 일괄 판매", amount: 10_000_000 },
    ]).ok,
    "single line ok",
  )

  assert(
    checks,
    "RI2-qty-unit-optional",
    validateRevenueItemsForTotalIncome(7_000_000, [
      {
        description: "축복받은 무기 마법 주문서",
        quantity: 2,
        unitPrice: 3_500_000,
        amount: 7_000_000,
      },
    ]).ok,
    "qty+unit optional",
  )

  assert(
    checks,
    "RI3-sum-must-match-total",
    !validateRevenueItemsForTotalIncome(10_000_000, [
      { description: "A", amount: 6_000_000 },
      { description: "B", amount: 3_000_000 },
    ]).ok,
    "sum mismatch rejected",
  )

  assert(
    checks,
    "RI4-empty-items-ok",
    validateRevenueItemsForTotalIncome(10_000_000, []).ok,
    "legacy no items",
  )

  assert(
    checks,
    "RI5-amount-blocked-with-receipts",
    !canChangeRevenueItemAmount(true),
    "receipt guard",
  )

  const editDesc = applyRevenueItemUpdates(
    [sampleItem()],
    [{ id: "i1", description: "수정된 설명" }],
    true,
  )
  assert(checks, "RI6-desc-edit-with-receipts", editDesc.ok, "desc edit allowed")

  const editAmt = applyRevenueItemUpdates(
    [sampleItem()],
    [{ id: "i1", amount: 9_000_000 }],
    true,
  )
  assert(checks, "RI7-amount-blocked-with-receipts", !editAmt.ok, editAmt.ok ? "unexpected" : "blocked")

  const editAmtNoReceipt = applyRevenueItemAmountBatch(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1 })],
    [
      { id: "i1", amount: 6_000_000 },
      { id: "i2", amount: 4_000_000 },
    ],
    false,
  )
  assert(
    checks,
    "RI8-batch-amount-edit-no-receipts",
    editAmtNoReceipt.ok,
    editAmtNoReceipt.ok ? "allowed" : editAmtNoReceipt.message,
  )

  if (editAmtNoReceipt.ok) {
    assert(
      checks,
      "RI9-invariant-after-batch-edit",
      validateRevenueItemsInvariant(10_000_000, editAmtNoReceipt.items).ok,
      "sum still matches",
    )
  }

  const partialAmt = applyRevenueItemUpdates(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1 })],
    [{ id: "i1", amount: 6_000_000 }],
    false,
  )
  assert(
    checks,
    "RI10-partial-amount-rejected",
    !partialAmt.ok,
    partialAmt.ok ? "unexpected ok" : "partial blocked",
  )

  const metaOnly = applyRevenueItemMetadataUpdates(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1 })],
    [{ id: "i1", description: "수정 A" }],
  )
  assert(checks, "RI11-metadata-without-amount", metaOnly.ok, metaOnly.ok ? "ok" : metaOnly.message)

  const recvQueue: FinanceWorkItem[] = [
    {
      id: "r1",
      kind: "revenue_receivable",
      occurredAt: "2026-08-10T00:00:00.000Z",
      totalAmount: 10_000_000,
      remainingAmount: 6_000_000,
      statusLabel: "미입금",
      title: "T",
      subtitle: "",
      description: "",
    },
    {
      id: "d1",
      kind: "dues_receivable",
      occurredAt: "2026-08-10T00:00:00.000Z",
      totalAmount: 200_000,
      remainingAmount: 200_000,
      statusLabel: "미납",
      title: "혈비",
      subtitle: "",
      description: "",
    },
  ]

  const payQueue: FinanceWorkItem[] = [
    {
      id: "p1",
      kind: "participant_payable",
      occurredAt: "2026-08-10T00:00:00.000Z",
      totalAmount: 2_000_000,
      remainingAmount: 2_000_000,
      statusLabel: "미지급",
      title: "T",
      subtitle: "",
      description: "",
    },
    {
      id: "m1",
      kind: "management_payable",
      occurredAt: "2026-08-10T00:00:00.000Z",
      totalAmount: 500_000,
      remainingAmount: 500_000,
      statusLabel: "관리비",
      title: "T",
      subtitle: "",
      description: "",
    },
  ]

  const inv = verifyQueueAggregateInvariant({
    receivableQueue: recvQueue,
    payableQueue: payQueue,
    receivableBreakdown: { dues: 200_000, revenue: 6_000_000, return: 0 },
    payableBreakdown: { participant: 2_000_000, additional: 0, management: 500_000 },
  })
  assert(checks, "WQ1-aggregate-invariant", inv.ok, inv.ok ? "ok" : inv.message)

  const sorted = sortFinanceWorkItems(recvQueue, "remaining_desc")
  assert(
    checks,
    "WQ2-default-sort-remaining-desc",
    sorted[0]?.remainingAmount === 6_000_000,
    `first=${sorted[0]?.remainingAmount}`,
  )

  const t4 = "2026-08-11T09:00:00.000Z"
  const t3 = "2026-08-10T00:00:00.000Z"
  const summary = computeFinanceSummary({
    checkpoint: {
      id: "cp",
      guildId: "g1",
      effectiveAt: t3,
      openingCashBalance: 5_000_000,
      createdBy: null,
      memo: "",
      createdAt: t3,
    },
    movements: [],
    settlements: [
      {
        settlementDbId: "s-new",
        sourceType: "boss",
        sourceId: "new",
        createdAtIso: t4,
        displayTitle: "신규",
        displaySub: "",
        totalIncome: 10_000_000,
        receivedAmount: 4_000_000,
        revenueItems: [
          sampleItem({ settlementId: "s-new", amount: 7_000_000, description: "A" }),
          sampleItem({
            id: "i2",
            settlementId: "s-new",
            amount: 3_000_000,
            description: "B",
            sortOrder: 1,
          }),
        ],
        receipts: [],
        participants: [],
        managementPayments: [],
      },
      {
        settlementDbId: "s-legacy",
        sourceType: "boss",
        sourceId: "legacy",
        createdAtIso: t4,
        displayTitle: "레거시",
        displaySub: "",
        totalIncome: 5_000_000,
        receivedAmount: 0,
        revenueItems: [],
        receipts: [],
        participants: [],
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
    "WQ3-revenue-detail-populated",
    summary.revenueDetails["s-new"]?.items.length === 2,
    `items=${summary.revenueDetails["s-new"]?.items.length}`,
  )

  assert(
    checks,
    "WQ4-legacy-no-items-not-error",
    summary.revenueDetails["s-legacy"]?.items.length === 0 &&
      summary.receivableBreakdown.revenue === 11_000_000,
    `revenue recv=${summary.receivableBreakdown.revenue}`,
  )

  assert(
    checks,
    "WQ5-queue-built-in-summary",
    summary.receivableQueue.some((i) => i.kind === "revenue_receivable"),
    `queue len=${summary.receivableQueue.length}`,
  )

  assert(
    checks,
    "WQ6-inline-disabled-except-revenue",
    !FINANCE_WORK_QUEUE_INLINE_MUTATIONS_ENABLED &&
      isInlineWorkQueueMutationEnabled("revenue_receivable") &&
      !isInlineWorkQueueMutationEnabled("participant_payable") &&
      !isInlineWorkQueueMutationEnabled("dues_receivable") &&
      !isInlineWorkQueueMutationEnabled("management_payable") &&
      !isInlineWorkQueueMutationEnabled("return_receivable") &&
      !isInlineWorkQueueMutationEnabled("additional_payable"),
    "cash-safe queue policy",
  )

  const duesNav = getWorkQueueNavigateAction({
    id: "d1",
    kind: "dues_receivable",
    occurredAt: t4,
    totalAmount: 200_000,
    remainingAmount: 200_000,
    statusLabel: "미납",
    title: "혈비",
    subtitle: "",
    description: "",
    billId: "bill-1",
  })
  assert(
    checks,
    "WQ7-dues-navigate-only",
    duesNav?.label === "혈비 관리" && duesNav.nav.financeTab === "dues",
    duesNav?.label ?? "null",
  )

  const partNav = getWorkQueueNavigateAction({
    id: "p1",
    kind: "participant_payable",
    occurredAt: t4,
    totalAmount: 1_000_000,
    remainingAmount: 1_000_000,
    statusLabel: "미지급",
    title: "T",
    subtitle: "",
    description: "",
    sourceType: "boss",
    sourceId: "2026-08-10-20",
  })
  assert(
    checks,
    "WQ8-participant-navigate-only",
    partNav?.label === "정산으로 이동" && partNav.nav.section === "boss",
    partNav?.label ?? "null",
  )

  const failed = checks.filter((c) => !c.ok)
  console.log("\n=== Finance 2.0-A+ Verify ===\n")
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length > 0) process.exit(1)
}

main()
