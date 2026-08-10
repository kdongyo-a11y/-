/**
 * Phase 9c — Production schema verify (020 guild_notices)
 * npm run phase9c:verify-notices-production-schema
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

  for (const [id, column] of [
    ["N-S1-guild_notices", "publish_from"],
    ["N-S2-is_important", "is_important"],
    ["N-S3-archived_at", "archived_at"],
    ["N-S4-guild_id", "guild_id"],
  ] as const) {
    const result = await probeColumn("guild_notices", column)
    checks.push({ id, ok: result.ok, detail: result.detail })
  }

  const passed = checks.filter((c) => c.ok).length
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9c notices production schema: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
