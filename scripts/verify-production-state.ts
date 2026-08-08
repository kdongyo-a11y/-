/**
 * 운영 초기화 후 DB 상태 검증
 *
 * npm run verify-production
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"

loadEnvLocal()

/** 초기화 후 0이어야 하는 운영/테스트 데이터 테이블 */
const TABLES_MUST_BE_EMPTY = [
  "boss_participation_logs",
  "boss_participations",
  "boss_event_spawns",
  "boss_events",
  "siege_surveys",
  "siege_participations",
  "siege_admin_logs",
  "siege_attendance_logs",
  "siege_events",
  "settlement_members",
  "settlement_revisions",
  "settlement_modification_logs",
  "settlements",
  "due_members",
  "due_change_logs",
  "dues",
  "expense_change_logs",
  "expenses",
  "guild_finance_setting_logs",
  "ledger_entries",
] as const

const TABLES_MUST_EXIST = [
  "guild_finance_settings",
  "guild_profile_settings",
  "contribution_score_settings",
] as const

function createAdminClient(): SupabaseClient {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function countRows(admin: SupabaseClient, table: string): Promise<number> {
  const { count, error } = await admin.from(table).select("*", { count: "exact", head: true })
  if (error) throw new Error(`${table} count 실패: ${error.message}`)
  return count ?? 0
}

async function listAuthUsers(admin: SupabaseClient) {
  const users: { id: string; email?: string }[] = []
  let page = 1
  const perPage = 200
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email })))
    if (data.users.length < perPage) break
    page += 1
  }
  return users
}

async function main(): Promise<void> {
  const admin = createAdminClient()
  const failures: string[] = []
  const passes: string[] = []

  console.log("\n========== 운영 DB 상태 검증 ==========\n")

  console.log("▶ 운영 데이터 (0건이어야 함):")
  for (const table of TABLES_MUST_BE_EMPTY) {
    const count = await countRows(admin, table)
    const ok = count === 0
    const line = `  ${ok ? "✓" : "✗"} ${table}: ${count}`
    console.log(line)
    if (ok) passes.push(table)
    else failures.push(`${table}=${count} (기대 0)`)
  }

  console.log("\n▶ 설정 테이블 (유지):")
  for (const table of TABLES_MUST_EXIST) {
    const count = await countRows(admin, table)
    const ok = count >= 1
    console.log(`  ${ok ? "✓" : "✗"} ${table}: ${count}`)
    if (!ok) failures.push(`${table}=${count} (기대 ≥1)`)
  }

  const { data: financeRows } = await admin
    .from("guild_finance_settings")
    .select("guild_id, opening_balance")
  const openingOk = (financeRows ?? []).length >= 1
  console.log(`  ${openingOk ? "✓" : "✗"} guild_finance_settings: ${financeRows?.length ?? 0} row(s)`)
  if (!openingOk) failures.push("guild_finance_settings empty")

  const { data: contributions } = await admin
    .from("contribution_score_settings")
    .select("general_boss_score, main_boss_score, siege_score, effective_from")
    .order("effective_from", { ascending: true })
  console.log("\n▶ contribution_score_settings:")
  for (const row of contributions ?? []) {
    console.log(
      `  - ${row.effective_from}: 일반=${row.general_boss_score}, 메인=${row.main_boss_score}, 공성=${row.siege_score}`,
    )
  }
  const defaultContribution = (contributions ?? []).some(
    (r) =>
      Number(r.general_boss_score) === 1 &&
      Number(r.main_boss_score) === 1.5 &&
      Number(r.siege_score) === 2 &&
      r.effective_from === "2000-01-01",
  )
  if (!defaultContribution) {
    failures.push("contribution_score_settings 기본 seed 없음")
  } else {
    console.log("  ✓ migration seed (1 / 1.5 / 2 / 2000-01-01) 유지")
  }

  const { data: members, error: membersError } = await admin
    .from("members")
    .select("id, nickname, role, status, must_change_password, auth_user_id")
    .order("nickname")
  if (membersError) throw membersError

  console.log("\n▶ members:")
  for (const m of members ?? []) {
    console.log(
      `  - ${m.nickname} role=${m.role} status=${m.status} must_change_password=${m.must_change_password}`,
    )
  }
  if ((members ?? []).length !== 1) {
    failures.push(`members=${members?.length ?? 0} (기대 1)`)
  } else {
    const only = members![0]
    if (only.nickname !== "군주") failures.push(`members nickname=${only.nickname} (기대 군주)`)
    if (only.role !== "admin") failures.push(`members role=${only.role} (기대 admin)`)
    if (only.status !== "활동") failures.push(`members status=${only.status} (기대 활동)`)
    if (only.must_change_password !== false) {
      failures.push(`must_change_password=${only.must_change_password} (기대 false)`)
    }
  }

  const authUsers = await listAuthUsers(admin)
  console.log("\n▶ auth.users:")
  for (const u of authUsers) {
    console.log(`  - ${u.id} ${u.email ?? "(no email)"}`)
  }
  if (authUsers.length !== 1) {
    failures.push(`auth.users=${authUsers.length} (기대 1)`)
  } else if (members?.length === 1 && authUsers[0].id !== members[0].auth_user_id) {
    failures.push("auth.users ↔ members auth_user_id 불일치")
  } else {
    console.log("  ✓ auth.users ↔ members 1:1 정합")
  }

  console.log("\n========== 검증 결과 ==========")
  if (failures.length === 0) {
    console.log("✓ PASS — 잔존 테스트 데이터 없음, 운영 초기 상태 정상\n")
    process.exit(0)
  }

  console.log("✗ FAIL — 다음 항목 확인 필요:")
  for (const f of failures) console.log(`  - ${f}`)
  console.log("")
  process.exit(1)
}

main().catch((error) => {
  console.error("\n[verify-production] 오류:", error instanceof Error ? error.message : error)
  process.exit(1)
})
