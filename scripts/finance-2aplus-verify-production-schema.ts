/**
 * Finance 2.0-A+ — Production schema verify (025 settlement_revenue_items)
 * npm run finance2aplus:verify-production-schema
 *
 * Read-only: no inserts/updates/deletes on production data.
 * Run after 025 migration is applied on Production.
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvFile, requireEnv } from "./load-env-file"

if (!loadEnvFile(".env.production.local")) {
  console.error(".env.production.local missing")
  process.exit(1)
}

async function main() {
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const checks: Array<{ id: string; ok: boolean; detail: string }> = []

  async function probeColumn(table: string, column: string) {
    const { error } = await admin.from(table).select(column).limit(0)
    if (!error) return { ok: true as const, detail: `${table}.${column}` }
    const code = error.code ?? "unknown"
    const message = error.message ?? String(error)
    return { ok: false as const, detail: `${table}.${column} code=${code} msg=${message}` }
  }

  for (const [id, table, column] of [
    ["FAP-S1-table", "settlement_revenue_items", "id"],
    ["FAP-S2-guild_id", "settlement_revenue_items", "guild_id"],
    ["FAP-S3-settlement_id", "settlement_revenue_items", "settlement_id"],
    ["FAP-S4-description", "settlement_revenue_items", "description"],
    ["FAP-S5-quantity", "settlement_revenue_items", "quantity"],
    ["FAP-S6-unit_price", "settlement_revenue_items", "unit_price"],
    ["FAP-S7-amount", "settlement_revenue_items", "amount"],
    ["FAP-S8-memo", "settlement_revenue_items", "memo"],
    ["FAP-S9-sort_order", "settlement_revenue_items", "sort_order"],
    ["FAP-S10-created_by", "settlement_revenue_items", "created_by"],
    ["FAP-S11-created_at", "settlement_revenue_items", "created_at"],
    ["FAP-S12-updated_at", "settlement_revenue_items", "updated_at"],
  ] as const) {
    const result = await probeColumn(table, column)
    checks.push({ id, ok: result.ok, detail: result.detail })
  }

  const nullUuid = "00000000-0000-0000-0000-000000000000"

  async function probeRpcExists(fnName: string, args: Record<string, unknown>) {
    const { data, error } = await admin.rpc(fnName, args)
    if (!error) {
      return {
        ok: true as const,
        detail: `${fnName} callable (returned without error)`,
      }
    }
    if (error.code === "PGRST202") {
      return { ok: false as const, detail: `${fnName} not in schema cache (026 not applied?)` }
    }
    return {
      ok: true as const,
      detail: `${fnName} callable (${error.code ?? "err"}: ${(error.message ?? "").slice(0, 100)})`,
    }
  }

  for (const [id, fnName, args] of [
    [
      "FAP-S15-rpc_insert_items",
      "insert_settlement_revenue_items_batch",
      {
        p_guild_id: nullUuid,
        p_settlement_id: nullUuid,
        p_actor_id: nullUuid,
        p_items: [],
      },
    ],
    [
      "FAP-S16-rpc_update_amounts",
      "update_settlement_revenue_item_amounts",
      {
        p_guild_id: nullUuid,
        p_settlement_id: nullUuid,
        p_amount_items: [],
      },
    ],
    [
      "FAP-S17-rpc_receipt_locked",
      "insert_settlement_revenue_receipt_locked",
      {
        p_guild_id: nullUuid,
        p_settlement_id: nullUuid,
        p_actor_id: nullUuid,
        p_amount: 1,
        p_received_at: new Date().toISOString(),
        p_memo: "",
      },
    ],
    [
      "FAP-S18-rpc_rollback_create",
      "rollback_settlement_create",
      { p_guild_id: nullUuid, p_settlement_id: nullUuid },
    ],
  ] as const) {
    const result = await probeRpcExists(fnName, args)
    checks.push({ id, ok: result.ok, detail: result.detail })
  }

  const { error: serviceSelectError } = await admin
    .from("settlement_revenue_items")
    .select("id")
    .limit(0)
  checks.push({
    id: "FAP-S13-service_role_select",
    ok: !serviceSelectError,
    detail: serviceSelectError
      ? `service_role select failed: ${serviceSelectError.message}`
      : "service_role can SELECT",
  })

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (anonKey) {
    const anon = createClient(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: anonData, error: anonError } = await anon
      .from("settlement_revenue_items")
      .select("id")
      .limit(1)
    const anonBlocked = !!anonError || (anonData ?? []).length === 0
    checks.push({
      id: "FAP-S14-anon_no_direct_access",
      ok: anonBlocked,
      detail: anonError
        ? `anon blocked with error (${anonError.code ?? "error"})`
        : anonBlocked
          ? "anon SELECT returned no rows (RLS blocked)"
          : "anon could read settlement_revenue_items rows without auth",
    })
  } else {
    checks.push({
      id: "FAP-S14-anon_no_direct_access",
      ok: true,
      detail: "skipped (NEXT_PUBLIC_SUPABASE_ANON_KEY not set)",
    })
  }

  const failed = checks.filter((c) => !c.ok)
  console.log("\n=== Finance 2.0-A+ Schema Verify (025) ===\n")
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`)
  if (failed.length > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
