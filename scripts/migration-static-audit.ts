/**
 * Migration static dry-run audit (DB 실행 없음)
 * 사용: npm run migration:static-audit
 */
import { readFileSync, readdirSync } from "fs"
import { resolve } from "path"

type Verdict = "PASS" | "WARN" | "BLOCKER"

type AuditRow = {
  file: string
  verdict: Verdict
  category: string
  notes: string[]
}

const MIGRATION_DIR = resolve(process.cwd(), "supabase/migrations")

const PRODUCTION_ORDER = [
  "001_members.sql",
  "002_participation.sql",
  "003_settlements.sql",
  "004_finance.sql",
  "005_admin_settings.sql",
  "006_guild_profile_settings.sql",
  "007_guilds_multitenant_phase1.sql",
  "008_boss_siege_multitenant_phase2.sql",
  "009_finance_settlement_multitenant_phase3.sql",
  "010_admin_settings_multitenant_phase4.sql",
  "010_fix_contribution_rls.sql",
  "011_onboarding_phase5.sql",
  "012_game_servers_guild_identity_phase55.sql",
  "013_admin_data_export_phase6.sql",
  "014_production_service_role_grants.sql",
] as const

function auditFile(name: string, sql: string): AuditRow {
  const notes: string[] = []
  let verdict: Verdict = "PASS"

  if (/COMMENT ON TABLE storage\.objects/i.test(sql)) {
    verdict = "WARN"
    notes.push("owner-sensitive: COMMENT ON TABLE storage.objects (42501 possible)")
  }

  if (/guild_code IN \('RED', 'BLUE'/i.test(sql) || /WHEN 'RED' THEN/i.test(sql)) {
    notes.push("test fixture UPDATE — no-op on empty production DB")
  }

  if (/INSERT INTO public\.(guild_finance_settings|contribution_score_settings|guild_profile_settings)/i.test(sql)) {
    notes.push("legacy singleton seed — removed/restructured in 007")
  }

  if (/INSERT INTO public\.game_servers/i.test(sql)) {
    notes.push("required master seed: 31 game_servers")
  }

  if (/ALTER COLUMN .* SET NOT NULL/i.test(sql)) {
    notes.push("NOT NULL — safe on empty table; BLOCKER if orphan rows exist")
    if (/members|boss_events|siege_events|settlements|dues|expenses|ledger_entries|guilds/.test(sql)) {
      notes.push("requires empty child tables OR backfilled guild_id")
    }
  }

  if (/DELETE FROM public\./i.test(sql)) {
    notes.push("DELETE seed rows — idempotent on fresh DB")
  }

  if (/DROP POLICY IF EXISTS/i.test(sql) && /CREATE POLICY/i.test(sql)) {
    notes.push("policy replace — idempotent")
  }

  if (/REFERENCES public\.(members|guilds|boss_events)/i.test(sql)) {
    notes.push("FK dependency on prior migrations")
  }

  if (/GRANT ALL ON TABLE/i.test(sql)) {
    notes.push("service_role grant — idempotent")
  }

  if (/002_fix_service_role_grants/.test(name)) {
    verdict = "BLOCKER"
    notes.push("MISLEADING FILENAME: must run AFTER 004 (references settlements, dues, ledger)")
  }

  let category = "schema"
  if (/INSERT INTO/i.test(sql)) category = notes.some((n) => n.includes("master seed")) ? "master seed" : "legacy seed"
  if (/GRANT/i.test(sql)) category = "grant fix"
  if (/DROP POLICY|CREATE POLICY/i.test(sql)) category = "policy fix"
  if (/fixture|RED|BLUE|GREEN/i.test(sql) && /UPDATE/i.test(sql)) category = "test fixture (no-op if empty)"

  return { file: name, verdict, category, notes }
}

function main() {
  const files = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql")).sort()
  console.log("=== Migration Static Dry-Run Audit ===\n")

  console.log("## Production execution order\n")
  PRODUCTION_ORDER.forEach((f, i) => console.log(`${String(i + 1).padStart(2, "0")}. ${f}`))
  console.log("\n## Optional (not in numbered chain)\n")
  console.log("- 002_reload_schema.sql — PostgREST cache refresh only")
  console.log("- 002_fix_service_role_grants.sql — superseded by Step 15 (014); run only if skipping 014\n")

  console.log("## Per-file audit\n")
  let blockers = 0
  let warns = 0

  for (const name of files) {
    const sql = readFileSync(resolve(MIGRATION_DIR, name), "utf8")
    const row = auditFile(name, sql)
    if (row.verdict === "BLOCKER") blockers++
    if (row.verdict === "WARN") warns++
    console.log(`[${row.verdict}] ${row.file}`)
    console.log(`  category: ${row.category}`)
    for (const n of row.notes) console.log(`  - ${n}`)
    console.log("")
  }

  console.log(`Summary: ${files.length} files, ${warns} WARN, ${blockers} BLOCKER (filename/order traps)`)
}

main()
