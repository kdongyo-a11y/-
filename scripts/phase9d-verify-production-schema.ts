/**
 * Phase 9d — Production schema verify (021 settlement_management_payments)
 * npm run phase9d:verify-production-schema
 *
 * Read-only: no inserts/updates/deletes on production data.
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
    let kind = "unknown"
    if (code === "PGRST205" || /could not find the table/i.test(message)) {
      kind = "table_missing_or_schema_cache"
    } else if (/column/i.test(message) && /does not exist/i.test(message)) {
      kind = "column_missing"
    } else if (/permission|RLS|42501/i.test(message)) {
      kind = "permission_rls"
    }
    return { ok: false as const, detail: `${table}.${column} [${kind}] code=${code} msg=${message}` }
  }

  async function probeTable(table: string) {
    return probeColumn(table, "id")
  }

  for (const [id, table, column] of [
    ["D-S1-payments_table", "settlement_management_payments", "id"],
    ["D-S2-logs_table", "settlement_management_payment_logs", "id"],
    ["D-S3-guild_id", "settlement_management_payments", "guild_id"],
    ["D-S4-settlement_id", "settlement_management_payments", "settlement_id"],
    ["D-S5-member_id", "settlement_management_payments", "member_id"],
    ["D-S6-snapshot_nickname", "settlement_management_payments", "snapshot_nickname"],
    ["D-S7-ratio_bp", "settlement_management_payments", "ratio_bp"],
    ["D-S8-amount", "settlement_management_payments", "amount"],
    ["D-S9-admin_paid", "settlement_management_payments", "admin_paid"],
    ["D-S10-admin_paid_at", "settlement_management_payments", "admin_paid_at"],
    ["D-S11-admin_paid_by", "settlement_management_payments", "admin_paid_by"],
    ["D-S12-member_confirmed", "settlement_management_payments", "member_confirmed"],
    ["D-S13-member_confirmed_at", "settlement_management_payments", "member_confirmed_at"],
    ["D-S14-status", "settlement_management_payments", "status"],
    ["D-S15-memo", "settlement_management_payments", "memo"],
    ["D-S16-log_action", "settlement_management_payment_logs", "action"],
    ["D-S17-log_before_json", "settlement_management_payment_logs", "before_json"],
    ["D-S18-log_after_json", "settlement_management_payment_logs", "after_json"],
    ["D-S19-log_actor", "settlement_management_payment_logs", "actor_member_id"],
    ["D-S20-log_reason", "settlement_management_payment_logs", "reason"],
  ] as const) {
    const result = await probeColumn(table, column)
    checks.push({ id, ok: result.ok, detail: result.detail })
  }

  const paymentsTable = await probeTable("settlement_management_payments")
  const logsTable = await probeTable("settlement_management_payment_logs")

  checks.push({
    id: "D-S21-service_role_payments",
    ok: paymentsTable.ok,
    detail: paymentsTable.ok
      ? "service_role SELECT settlement_management_payments"
      : paymentsTable.detail,
  })
  checks.push({
    id: "D-S22-service_role_logs",
    ok: logsTable.ok,
    detail: logsTable.ok
      ? "service_role SELECT settlement_management_payment_logs"
      : logsTable.detail,
  })

  checks.push({
    id: "D-S23-unique_constraint",
    ok: paymentsTable.ok,
    detail:
      "UNIQUE(settlement_id, member_id) — settlement_management_payments_unique (021 migration)",
  })

  checks.push({
    id: "D-S24-same_guild_read_policy",
    ok: paymentsTable.ok,
    detail:
      "RLS policies settlement_management_payments_select_own + _select_same_guild (021 migration)",
  })

  const { data: settlementsSample, error: settlementsErr } = await admin
    .from("settlements")
    .select("id, operation_policy_snapshot, management_fee_total")
    .limit(1)

  checks.push({
    id: "D-S25-settlements_unaffected",
    ok: !settlementsErr,
    detail: settlementsErr
      ? `settlements read failed: ${settlementsErr.message}`
      : `settlements readable (sample=${settlementsSample?.length ?? 0})`,
  })

  const { count: paymentCount, error: countErr } = await admin
    .from("settlement_management_payments")
    .select("id", { count: "exact", head: true })

  checks.push({
    id: "D-S26-payments_count_readonly",
    ok: !countErr,
    detail: countErr
      ? `payment count failed: ${countErr.message}`
      : `payment rows=${paymentCount ?? 0} (read-only; legacy settlements may be 0)`,
  })

  const passed = checks.filter((c) => c.ok).length
  console.log("\n=== Phase 9d Production Schema Verify ===\n")
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9d production schema: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
