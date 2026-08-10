/**
 * Finance 2.0-A — Production schema verify (022~024)
 * npm run finance2a:verify-production-schema
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
    return { ok: false as const, detail: `${table}.${column} code=${code} msg=${message}` }
  }

  for (const [id, table, column] of [
    ["FA-S1-checkpoints", "guild_cash_checkpoints", "id"],
    ["FA-S2-cp_guild_id", "guild_cash_checkpoints", "guild_id"],
    ["FA-S3-cp_effective_at", "guild_cash_checkpoints", "effective_at"],
    ["FA-S4-cp_opening", "guild_cash_checkpoints", "opening_cash_balance"],
    ["FA-S5-cp_memo", "guild_cash_checkpoints", "memo"],
    ["FA-S6-movements", "guild_cash_movements", "id"],
    ["FA-S7-mv_direction", "guild_cash_movements", "direction"],
    ["FA-S8-mv_category", "guild_cash_movements", "category"],
    ["FA-S9-mv_cancelled", "guild_cash_movements", "cancelled"],
    ["FA-S10-receipts", "settlement_revenue_receipts", "id"],
    ["FA-S11-rc_settlement_id", "settlement_revenue_receipts", "settlement_id"],
    ["FA-S12-rc_amount", "settlement_revenue_receipts", "amount"],
    ["FA-S13-rc_received_at", "settlement_revenue_receipts", "received_at"],
  ] as const) {
    const result = await probeColumn(table, column)
    checks.push({ id, ok: result.ok, detail: result.detail })
  }

  const failed = checks.filter((c) => !c.ok)
  console.log("\n=== Finance 2.0-A Schema Verify ===\n")
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
