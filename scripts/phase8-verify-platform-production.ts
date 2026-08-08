/**
 * Phase 8 — Production-safe read-only smoke verification
 * 사용: npm run phase8:verify-platform-production
 *
 * .env.production.local 전용. INSERT/UPDATE/DELETE 없음.
 * RED/BLUE fixture seed 금지 — Production clean DB 대상.
 */
import { execSync } from "child_process"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvFile, requireEnv } from "./load-env-file"
import { FIXTURE_GUILD_NAMES } from "../lib/guild-types"
import {
  buildPlatformDashboard,
  fetchFeatureUsageStats,
  fetchGuildUsageTable,
  fetchPlatformKpis,
  fetchRecentGuilds,
} from "../lib/platform/platform-analytics"

if (!loadEnvFile(".env.production.local")) {
  console.error(".env.production.local 없음 — production 키를 설정하세요.")
  process.exit(1)
}

type Check = { id: string; ok: boolean; detail: string }

const FIXTURE_GUILD_CODES = ["RED", "BLUE", "GREEN"] as const
const FIXTURE_GUILD_NAMES_LIST = Object.values(FIXTURE_GUILD_NAMES)

async function tableExists(admin: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("id", { count: "exact", head: true })
  if (!error) return true
  if (error.code === "42P01") return false
  throw error
}

async function columnsSelectable(
  admin: SupabaseClient,
  table: string,
  columns: string,
): Promise<boolean> {
  const { error } = await admin.from(table).select(columns).limit(0)
  return !error
}

async function countTable(admin: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true })
  if (error) return null
  return count ?? 0
}

function printResults(results: Check[]) {
  console.log("\n=== Phase 8 Production-Safe Verify ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`)
  }
  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} passed`)
  console.log("\n(read-only — no DB mutations performed)\n")
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: Check[] = []

  // M1
  const hasPlatformAdmins = await tableExists(admin, "platform_admins")
  results.push({
    id: "M1",
    ok: hasPlatformAdmins,
    detail: hasPlatformAdmins ? "platform_admins table exists" : "platform_admins missing — apply 015",
  })

  // M2
  const hasUsageEvents = await tableExists(admin, "usage_events")
  results.push({
    id: "M2",
    ok: hasUsageEvents,
    detail: hasUsageEvents ? "usage_events table exists" : "usage_events missing — apply 015",
  })

  if (!hasPlatformAdmins || !hasUsageEvents) {
    printResults(results)
    process.exit(1)
  }

  // M3 — count only, no auth_user_id output
  const { count: activeAdmins, error: adminCountError } = await admin
    .from("platform_admins")
    .select("*", { count: "exact", head: true })
    .eq("status", "active")

  results.push({
    id: "M3",
    ok: !adminCountError && (activeAdmins ?? 0) >= 1,
    detail: adminCountError
      ? `count error: ${adminCountError.code}`
      : `active platform_admin count=${activeAdmins ?? 0} (expected >= 1)`,
  })

  // M4
  const serverCount = await countTable(admin, "game_servers")
  results.push({
    id: "M4",
    ok: serverCount === 31,
    detail: `game_servers count=${serverCount ?? "ERR"} (expected 31)`,
  })

  // M5 — no RED/BLUE/GREEN fixture
  const { data: fixtureByCode, error: fixtureCodeError } = await admin
    .from("guilds")
    .select("id")
    .in("guild_code", [...FIXTURE_GUILD_CODES])

  const { data: fixtureByName, error: fixtureNameError } = await admin
    .from("guilds")
    .select("id")
    .in("guild_name", FIXTURE_GUILD_NAMES_LIST)

  const fixtureCodeCount = fixtureCodeError ? -1 : (fixtureByCode?.length ?? 0)
  const fixtureNameCount = fixtureNameError ? -1 : (fixtureByName?.length ?? 0)
  const noFixtures = fixtureCodeCount === 0 && fixtureNameCount === 0

  results.push({
    id: "M5",
    ok: noFixtures && !fixtureCodeError && !fixtureNameError,
    detail: noFixtures
      ? "no RED/BLUE/GREEN fixture guilds (production clean)"
      : `fixture detected: by_code=${fixtureCodeCount}, by_name=${fixtureNameCount}`,
  })

  // M6
  const usageColsOk = await columnsSelectable(
    admin,
    "usage_events",
    "event_type, guild_id, member_id, metadata, created_at",
  )
  results.push({
    id: "M6",
    ok: usageColsOk,
    detail: usageColsOk
      ? "usage_events columns OK (event_type, guild_id, member_id, metadata, created_at)"
      : "usage_events schema columns missing or inaccessible",
  })

  // M7
  const platformColsOk = await columnsSelectable(
    admin,
    "platform_admins",
    "id, auth_user_id, display_name, status, created_at",
  )
  results.push({
    id: "M7",
    ok: platformColsOk,
    detail: platformColsOk
      ? "platform_admins schema OK (id, auth_user_id, display_name, status, created_at)"
      : "platform_admins schema columns missing or inaccessible",
  })

  // M8 — aggregation helpers (read-only)
  let m8Ok = true
  let m8Detail = "dashboard helpers OK"
  try {
    const kpis = await fetchPlatformKpis(admin)
    await fetchFeatureUsageStats(admin, "7d")
    await fetchRecentGuilds(admin, 5)
    await fetchGuildUsageTable(admin)
    await buildPlatformDashboard(admin, "7d")
    m8Detail = `helpers OK — guilds=${kpis.totalGuilds}, members=${kpis.totalMembers}, usage_events readable`
  } catch (error) {
    m8Ok = false
    m8Detail = `helper error: ${error instanceof Error ? error.message : "unknown"}`
  }
  results.push({ id: "M8", ok: m8Ok, detail: m8Detail })

  // M9 — this script performs read-only only (self-attestation + no write calls in code)
  results.push({
    id: "M9",
    ok: true,
    detail: "guild/member/business data — SELECT/count only (no INSERT/UPDATE/DELETE in script)",
  })

  // M10
  results.push({
    id: "M10",
    ok: true,
    detail: "usage_events — no test event INSERT in script",
  })

  // M11 — verify output doesn't contain service key
  const outputSample = JSON.stringify(results)
  const m11Ok =
    !outputSample.includes(serviceKey) &&
    !outputSample.includes("internal_email") &&
    !outputSample.includes("eyJ")
  results.push({
    id: "M11",
    ok: m11Ok,
    detail: m11Ok ? "no secrets/PII in verify output" : "potential secret leak in output — review",
  })

  // M12
  try {
    execSync("npm run build", { stdio: "pipe", cwd: process.cwd() })
    results.push({ id: "M12", ok: true, detail: "npm run build PASS" })
  } catch (e) {
    const err = e as { stderr?: Buffer }
    results.push({
      id: "M12",
      ok: false,
      detail: `build FAIL: ${err.stderr?.toString().slice(0, 200) ?? "unknown"}`,
    })
  }

  printResults(results)

  const failed = results.filter((r) => !r.ok)
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
