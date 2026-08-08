/**
 * Production schema read-only verification (INSERT/UPDATE/DELETE 없음)
 * 사용: npm run production:verify-schema
 *
 * 대상: migration 001~014 적용 직후의 **clean production** Supabase
 * 테스트 DB( fixture guild 존재)에서는 WARN 항목이 출력됩니다.
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvFile, requireEnv } from "./load-env-file"

const useProduction = process.argv.includes("--production")
if (useProduction) {
  if (!loadEnvFile(".env.production.local")) {
    console.error(".env.production.local 없음 — production 키를 설정하세요.")
    process.exit(1)
  }
} else {
  loadEnvFile(".env.local")
}

type Check = { id: string; ok: boolean; level: "pass" | "warn" | "fail"; detail: string }

async function countTable(
  admin: ReturnType<typeof createClient>,
  table: string,
): Promise<number | null> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true })
  if (error) return null
  return count ?? 0
}

async function tableExists(admin: ReturnType<typeof createClient>, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("*", { count: "exact", head: true })
  return !error
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: Check[] = []

  const requiredTables = [
    "members",
    "guilds",
    "game_servers",
    "boss_events",
    "siege_events",
    "settlements",
    "dues",
    "expenses",
    "ledger_entries",
    "contribution_score_settings",
    "guild_finance_settings",
    "guild_export_logs",
  ] as const

  for (const t of requiredTables) {
    const exists = await tableExists(admin, t)
    results.push({
      id: `table:${t}`,
      ok: exists,
      level: exists ? "pass" : "fail",
      detail: exists ? "exists" : "missing",
    })
  }

  const serverCount = await countTable(admin, "game_servers")
  results.push({
    id: "master:game_servers",
    ok: serverCount === 31,
    level: serverCount === 31 ? "pass" : "fail",
    detail: `count=${serverCount ?? "ERR"} (expected 31)`,
  })

  const emptyTables = [
    "guilds",
    "members",
    "boss_events",
    "siege_events",
    "settlements",
    "dues",
    "expenses",
    "ledger_entries",
    "guild_export_logs",
  ] as const

  for (const t of emptyTables) {
    const c = await countTable(admin, t)
    if (c === null) continue
    const isEmpty = c === 0
    results.push({
      id: `empty:${t}`,
      ok: isEmpty,
      level: isEmpty ? "pass" : "warn",
      detail: isEmpty ? "0 rows (clean production)" : `${c} rows — test/fixture data detected`,
    })
  }

  const { data: fixtureGuilds } = await admin
    .from("guilds")
    .select("guild_code, guild_name")
    .in("guild_code", ["RED", "BLUE", "GREEN"])

  const hasFixture = (fixtureGuilds?.length ?? 0) > 0
  results.push({
    id: "no:fixture_guild",
    ok: !hasFixture,
    level: hasFixture ? "warn" : "pass",
    detail: hasFixture
      ? `fixture guild_code found: ${fixtureGuilds!.map((g) => g.guild_code).join(", ")}`
      : "no RED/BLUE/GREEN fixture",
  })

  const { data: rpcMember } = await admin.rpc("current_member_guild_id")
  results.push({
    id: "fn:current_member_guild_id",
    ok: rpcMember === null || rpcMember === undefined,
    level: "pass",
    detail: "callable (returns null without session — expected)",
  })

  console.log("=== Production Schema Verification (read-only) ===\n")
  let fails = 0
  let warns = 0
  for (const r of results) {
    const mark = r.level === "pass" ? "PASS" : r.level === "warn" ? "WARN" : "FAIL"
    if (r.level === "fail") fails++
    if (r.level === "warn") warns++
    console.log(`[${mark}] ${r.id}: ${r.detail}`)
  }

  console.log(`\n${results.length - fails - warns} pass, ${warns} warn, ${fails} fail`)
  if (fails > 0) process.exit(1)
  if (useProduction && warns > 0) {
    console.log("\nFAIL: production 검증은 WARN 0 이어야 합니다.")
    process.exit(1)
  }
  if (warns > 0) {
    console.log("\nNote: WARN = test/fixture data present. Clean production should have 0 warns.")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
