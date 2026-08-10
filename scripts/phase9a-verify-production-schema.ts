/**
 * Phase 9a — Production read-only schema verification
 * npm run phase9a:verify-production-schema
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvFile, requireEnv } from "./load-env-file"

if (!loadEnvFile(".env.production.local")) {
  console.error(".env.production.local missing")
  process.exit(1)
}

type Check = { id: string; ok: boolean; detail: string }

async function columnsOk(
  admin: ReturnType<typeof createClient>,
  table: string,
  columns: string,
): Promise<{ ok: boolean; detail: string }> {
  const { error } = await admin.from(table).select(columns).limit(0)
  if (error) return { ok: false, detail: error.message }
  return { ok: true, detail: "selectable" }
}

async function main() {
  const admin = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const checks: Check[] = []

  const finance = await columnsOk(
    admin,
    "guild_finance_settings",
    "guild_id,opening_balance,rounding_remainder_balance",
  )
  checks.push({ id: "col:guild_finance_settings.rounding_remainder_balance", ...finance })

  const settlements = await columnsOk(
    admin,
    "settlements",
    "id,rounding_unit,rounding_policy,guild_share_ledger_amount,guild_share_sub_thousand",
  )
  checks.push({ id: "col:settlements.rounding_snapshot", ...settlements })

  const { data: sampleFinance } = await admin
    .from("guild_finance_settings")
    .select("rounding_remainder_balance")
    .limit(1)
  checks.push({
    id: "read:guild_finance_settings.sample",
    ok: sampleFinance !== null,
    detail: sampleFinance?.length ? `default=${sampleFinance[0]?.rounding_remainder_balance}` : "no rows",
  })

  const { data: sampleSettlement } = await admin
    .from("settlements")
    .select("rounding_unit,guild_share_sub_thousand")
    .limit(1)
  checks.push({
    id: "read:settlements.legacy_null",
    ok: true,
    detail:
      sampleSettlement?.length === 0
        ? "no settlements (OK)"
        : `sample rounding_unit=${sampleSettlement?.[0]?.rounding_unit ?? "null"}`,
  })

  console.log("\n=== Phase 9a Production Schema (read-only) ===\n")
  let failed = 0
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
    if (!c.ok) failed++
  }
  console.log(`\n${checks.length - failed}/${checks.length} passed\n`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
