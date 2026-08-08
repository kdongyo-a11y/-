/**
 * Production migration runner — Supabase Postgres 직접 연결
 *
 * 사전: 신규 빈 Supabase 프로젝트 + .env.production.local
 * 사용:
 *   ALLOW_PRODUCTION_MIGRATE=YES npm run production:migrate
 *
 * Step 10 42501 시 step10_admin_phase4_core.sql 자동 fallback
 */
import { readFileSync } from "fs"
import { resolve } from "path"
import pg from "pg"
import { loadEnvFile, requireEnv } from "./load-env-file"

const MIGRATION_STEPS: { label: string; path: string; optional?: boolean }[] = [
  { label: "Step 1", path: "supabase/migrations/001_members.sql" },
  { label: "Step 2", path: "supabase/migrations/002_participation.sql" },
  { label: "Step 3", path: "supabase/migrations/003_settlements.sql" },
  { label: "Step 4", path: "supabase/migrations/004_finance.sql" },
  { label: "Step 5", path: "supabase/migrations/005_admin_settings.sql" },
  { label: "Step 6", path: "supabase/migrations/006_guild_profile_settings.sql" },
  { label: "Step 7", path: "supabase/migrations/007_guilds_multitenant_phase1.sql" },
  { label: "Step 8", path: "supabase/migrations/008_boss_siege_multitenant_phase2.sql" },
  { label: "Step 9", path: "supabase/migrations/009_finance_settlement_multitenant_phase3.sql" },
  { label: "Step 10", path: "supabase/migrations/010_admin_settings_multitenant_phase4.sql" },
  { label: "Step 11", path: "supabase/migrations/010_fix_contribution_rls.sql" },
  { label: "Step 12", path: "supabase/migrations/011_onboarding_phase5.sql" },
  { label: "Step 13", path: "supabase/migrations/012_game_servers_guild_identity_phase55.sql" },
  { label: "Step 14", path: "supabase/migrations/013_admin_data_export_phase6.sql" },
  { label: "Step 15", path: "supabase/migrations/014_production_service_role_grants.sql" },
]

const STEP10_CORE = "supabase/production/step10_admin_phase4_core.sql"

function isOwnerError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("42501") || /must be owner of relation/i.test(msg)
}

async function execSql(client: pg.Client, sql: string, label: string): Promise<void> {
  process.stdout.write(`  → ${label} ... `)
  try {
    await client.query(sql)
    console.log("OK")
  } catch (err) {
    console.log("FAIL")
    throw err
  }
}

async function main() {
  if (process.env.ALLOW_PRODUCTION_MIGRATE !== "YES") {
    console.error(
      "안전 확인: ALLOW_PRODUCTION_MIGRATE=YES 환경변수가 필요합니다.\n" +
        "예: ALLOW_PRODUCTION_MIGRATE=YES npm run production:migrate",
    )
    process.exit(1)
  }

  const loaded = loadEnvFile(".env.production.local")
  if (!loaded) {
    console.error(".env.production.local 파일이 없습니다. .env.production.local.example 참고")
    process.exit(1)
  }

  const dbUrl = requireEnv(
    "SUPABASE_DB_URL",
    "Supabase Dashboard → Settings → Database → Connection string (URI)",
  )

  const urlHost = new URL(dbUrl.replace(/^postgresql:\/\//, "http://")).hostname
  const testHost = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
  if (testHost && dbUrl.includes("hwmjdvlrwnvvaibajfqr")) {
    console.error("테스트 DB URL 감지 — production 전용 Supabase 프로젝트 URL을 사용하세요.")
    process.exit(1)
  }

  console.log("=== Production Migration Runner ===")
  console.log(`DB host: ${urlHost}`)
  console.log(`Steps: ${MIGRATION_STEPS.length}\n`)

  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } })
  await client.connect()

  try {
    for (const step of MIGRATION_STEPS) {
      const fullPath = resolve(process.cwd(), step.path)
      const sql = readFileSync(fullPath, "utf8")
      console.log(`${step.label}: ${step.path}`)

      if (step.path.includes("010_admin_settings_multitenant_phase4")) {
        try {
          await execSql(client, sql, "full 010")
        } catch (err) {
          if (!isOwnerError(err)) throw err
          console.log("  ⚠ Step 10: 42501 owner error — running step10_admin_phase4_core.sql")
          const coreSql = readFileSync(resolve(process.cwd(), STEP10_CORE), "utf8")
          await execSql(client, coreSql, "step10 core (no storage COMMENT)")
        }
        continue
      }

      await execSql(client, sql, step.label)
    }

    console.log("\n✓ All migration steps completed.")
    console.log("다음: npm run production:verify-schema (production env)")
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error("\nMigration aborted:", err instanceof Error ? err.message : err)
  process.exit(1)
})
