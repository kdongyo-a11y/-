/**
 * Finance 2.0-A+ — DB atomicity / concurrency structural verify
 * npm run finance2aplus:verify-atomicity
 *
 * AT1/AT5 full failure-injection requires local Postgres with 025+026 applied.
 * This script covers structural guarantees + logic regression (AT2–AT4, AT6–AT9).
 */
import { readFileSync } from "fs"
import { join } from "path"
import {
  applyRevenueItemAmountBatch,
  applyRevenueItemMetadataUpdates,
  validateRevenueItemsInvariant,
} from "../lib/settlement-revenue-item-utils"
import { mapFinanceRevenueRpcError, FINANCE_REVENUE_RPC_FUNCTIONS } from "../lib/settlement-revenue-item-rpc-errors"
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
    description: "A",
    quantity: null,
    unitPrice: null,
    amount: 7_000_000,
    memo: "",
    sortOrder: 0,
    createdBy: null,
    createdAt: "2026-08-10T00:00:00.000Z",
    updatedAt: "2026-08-10T00:00:00.000Z",
    ...overrides,
  }
}

function readRepoFile(relPath: string): string {
  return readFileSync(join(process.cwd(), relPath), "utf8")
}

function main() {
  const checks: Check[] = []

  const itemDataSrc = readRepoFile("lib/supabase/settlement-revenue-item-data.ts")
  const receiptDataSrc = readRepoFile("lib/supabase/settlement-revenue-receipt-data.ts")
  const settlementDataSrc = readRepoFile("lib/supabase/settlement-data.ts")
  const migration026 = readRepoFile("supabase/migrations/026_finance_revenue_atomic_operations.sql")

  assert(
    checks,
    "AT1-amount-update-uses-single-rpc",
    itemDataSrc.includes('admin.rpc("update_settlement_revenue_item_amounts"') &&
      !itemDataSrc.includes("persistRevenueItemRows(admin, guildId, settlementId, applied.items)") &&
      migration026.includes("FOR UPDATE") &&
      migration026.includes("UPDATE public.settlement_revenue_items"),
    "amount path = one RPC transaction (not per-row UPDATE loop)",
  )

  assert(
    checks,
    "AT1-migration-declares-atomic-batch",
    migration026.includes("update_settlement_revenue_item_amounts") &&
      migration026.includes("incomplete_amount_batch"),
    "026 batch function present",
  )

  const batchBadSum = applyRevenueItemAmountBatch(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1 })],
    [
      { id: "i1", amount: 6_000_000 },
      { id: "i2", amount: 3_000_000 },
    ],
    false,
  )
  assert(
    checks,
    "AT2-sum-mismatch-rejected-client",
    batchBadSum.ok && !validateRevenueItemsInvariant(10_000_000, batchBadSum.items).ok,
    batchBadSum.ok ? "client batch ok but invariant rejects 9M != 10M" : batchBadSum.message,
  )

  assert(
    checks,
    "AT2-rpc-error-mapping",
    mapFinanceRevenueRpcError({ message: "amount_sum_mismatch" })?.includes("일치") === true,
    "RPC sum mismatch maps to user message",
  )

  const batchWithReceipts = applyRevenueItemAmountBatch(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1 })],
    [
      { id: "i1", amount: 6_000_000 },
      { id: "i2", amount: 4_000_000 },
    ],
    true,
  )
  assert(
    checks,
    "AT3-receipt-blocks-amount-batch",
    !batchWithReceipts.ok,
    batchWithReceipts.ok ? "unexpected ok" : "blocked",
  )

  assert(
    checks,
    "AT3-rpc-receipt-exists-mapping",
    mapFinanceRevenueRpcError({ message: "receipts_exist" })?.includes("입금") === true,
    "RPC receipts_exist mapped",
  )

  assert(
    checks,
    "AT4-receipt-insert-uses-locked-rpc",
    receiptDataSrc.includes("insert_settlement_revenue_receipt_locked") &&
      migration026.includes("insert_settlement_revenue_receipt_locked") &&
      migration026.includes("v_received_sum + p_amount > v_total_income") &&
      migration026.includes("FOR UPDATE"),
    "receipt cap checked inside settlement FOR UPDATE transaction",
  )

  const rollbackFnBody =
    settlementDataSrc.match(
      /export async function rollbackSettlementCreate[\s\S]*?^}/m,
    )?.[0] ?? ""

  assert(
    checks,
    "AT5-rollback-uses-single-rpc",
    rollbackFnBody.includes('admin.rpc("rollback_settlement_create"') &&
      !rollbackFnBody.includes('.from("settlement_members").delete()') &&
      migration026.includes("rollback_settlement_create"),
    "rollback = one RPC transaction (not multi-query JS cleanup)",
  )

  assert(
    checks,
    "AT4-amount-rpc-rechecks-receipts-in-tx",
    migration026.includes("update_settlement_revenue_item_amounts") &&
      migration026.includes("v_receipt_sum > 0") &&
      migration026.includes("FOR UPDATE"),
    "amount RPC re-checks receipts under settlement lock",
  )

  assert(
    checks,
    "AT5-create-items-uses-batch-rpc",
    itemDataSrc.includes("insert_settlement_revenue_items_batch") &&
      migration026.includes("INSERT INTO public.settlement_revenue_items"),
    "create items = single INSERT in RPC transaction",
  )

  const migration009 = readRepoFile("supabase/migrations/009_finance_settlement_multitenant_phase3.sql")
  assert(
    checks,
    "AT6-settlement-unique-per-guild",
    migration009.includes("UNIQUE (guild_id, source_type, source_id)"),
    "duplicate create retry blocked at DB",
  )

  assert(
    checks,
    "AT6-items-insert-idempotent-guard",
    migration026.includes("revenue_items_already_exist"),
    "second items batch rejected if items exist",
  )

  const metaOnly = applyRevenueItemMetadataUpdates(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1, description: "B" })],
    [{ id: "i1", description: "A revised" }],
  )
  assert(
    checks,
    "AT7-legacy-metadata-unchanged-amounts",
    metaOnly.ok &&
      metaOnly.items[0]?.amount === 7_000_000 &&
      metaOnly.items[1]?.amount === 3_000_000,
    "metadata edit preserves amounts",
  )

  assert(
    checks,
    "AT7-empty-items-create-skips-rpc",
    readRepoFile("lib/supabase/settlement-revenue-item-data.ts").includes(
      "if (!items || items.length === 0) return { ok: true }",
    ),
    "items=0 skips RPC",
  )

  for (const fn of FINANCE_REVENUE_RPC_FUNCTIONS) {
    assert(checks, `AT8-rpc-defined-${fn}`, migration026.includes(fn), fn)
  }

  assert(
    checks,
    "AT8-service-role-grants",
    migration026.includes("GRANT EXECUTE ON FUNCTION public.insert_settlement_revenue_items_batch") &&
      migration026.includes("GRANT EXECUTE ON FUNCTION public.update_settlement_revenue_item_amounts") &&
      migration026.includes("GRANT EXECUTE ON FUNCTION public.insert_settlement_revenue_receipt_locked") &&
      migration026.includes("GRANT EXECUTE ON FUNCTION public.rollback_settlement_create"),
    "service_role only",
  )

  const batchOk = applyRevenueItemAmountBatch(
    [sampleItem(), sampleItem({ id: "i2", amount: 3_000_000, sortOrder: 1 })],
    [
      { id: "i1", amount: 6_000_000 },
      { id: "i2", amount: 4_000_000 },
    ],
    false,
  )
  if (batchOk.ok) {
    assert(
      checks,
      "AT9-batch-invariant",
      validateRevenueItemsInvariant(10_000_000, batchOk.items).ok,
      "6M+4M=10M",
    )
  } else {
    assert(checks, "AT9-batch-invariant", false, batchOk.message)
  }

  const failed = checks.filter((c) => !c.ok)
  console.log("\n=== Finance 2.0-A+ Atomicity Verify ===\n")
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length > 0) process.exit(1)
}

main()
