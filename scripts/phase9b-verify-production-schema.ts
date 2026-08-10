/**
 * Phase 9b — Production schema verify (017)
 * 사용: npm run phase9b:verify-production-schema
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

  async function tableHasColumn(table: string, column: string) {
    const { data, error } = await admin.from(table).select(column).limit(1)
    return !error
  }

  checks.push({
    id: "S1-guild_operation_settings",
    ok: await tableHasColumn("guild_operation_settings", "management_fee_mode"),
    detail: "guild_operation_settings.management_fee_mode",
  })
  checks.push({
    id: "S2-guild_management_fee_allocations",
    ok: await tableHasColumn("guild_management_fee_allocations", "ratio_bp"),
    detail: "guild_management_fee_allocations.ratio_bp",
  })
  checks.push({
    id: "S3-settlements_snapshot",
    ok: await tableHasColumn("settlements", "operation_policy_snapshot"),
    detail: "settlements.operation_policy_snapshot",
  })
  checks.push({
    id: "S4-operation_logs",
    ok: await tableHasColumn("guild_operation_setting_logs", "new_snapshot"),
    detail: "guild_operation_setting_logs.new_snapshot",
  })

  const passed = checks.filter((c) => c.ok).length
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9b production schema: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
