/**
 * Phase 9c — Production schema verify (018)
 * npm run phase9c:verify-production-schema
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
    const { error } = await admin.from(table).select(column).limit(0)
    return !error
  }

  checks.push({
    id: "S1-policy_versions",
    ok: await tableHasColumn("guild_operation_policy_versions", "effective_from"),
    detail: "guild_operation_policy_versions.effective_from",
  })
  checks.push({
    id: "S2-policy_snapshot",
    ok: await tableHasColumn("guild_operation_policy_versions", "policy_snapshot"),
    detail: "guild_operation_policy_versions.policy_snapshot",
  })
  checks.push({
    id: "S3-version-column",
    ok: await tableHasColumn("guild_operation_policy_versions", "version"),
    detail: "guild_operation_policy_versions.version",
  })
  checks.push({
    id: "S4-cancelled_at",
    ok: await tableHasColumn("guild_operation_policy_versions", "cancelled_at"),
    detail: "guild_operation_policy_versions.cancelled_at",
  })

  const passed = checks.filter((c) => c.ok).length
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9c production schema: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
