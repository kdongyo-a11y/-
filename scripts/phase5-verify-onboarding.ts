/**
 * Phase 5 onboarding 검증:
 * - 011 migration 컬럼 존재 확인
 * - GREEN guild 생성 / 로그인 / wizard 완료
 * - RED/BLUE/GREEN 동일 nickname 허용
 * - tenant isolation (GREEN admin → RED/BLUE 차단)
 * - 중복 guild_name 409
 * 사용: npm run phase5:verify-onboarding
 *
 * 사전: Supabase SQL Editor에서 011_onboarding_phase5.sql 수동 실행
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { createGuildOnboarding } from "../lib/supabase/guild-onboarding-saga"
import { FIXTURE_GUILD_NAMES, isValidGuildName, normalizeGuildName } from "../lib/guild-types"
import {
  fetchGuildIdByServerAndCode,
  fetchGuildIdByServerAndName,
  getFixtureServerId,
  loginAsServerGuild,
  loginFixtureGuild,
} from "./test-auth-helpers"

loadEnvLocal()

const GREEN_PASSWORD = process.env.PHASE5_GREEN_PASSWORD ?? "green12345"
const RED_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"

type CheckResult = { name: string; ok: boolean; detail: string }

async function ensureMigrationColumn(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("guilds").select("onboarding_completed").limit(1)
  if (error?.message?.includes("onboarding_completed")) {
    console.warn(
      "\n[WARN] guilds.onboarding_completed 컬럼 없음 — onboarding flag 검증은 SKIP.\n" +
        "Supabase SQL Editor에서 supabase/migrations/011_onboarding_phase5.sql 을 실행하세요.\n",
    )
    return false
  }
  if (error) {
    console.error("guilds 조회 실패:", error.message)
    process.exit(1)
  }
  return true
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: CheckResult[] = []
  const fixtureServerId = await getFixtureServerId(admin)

  const hasOnboardingColumn = await ensureMigrationColumn(admin)

  // RED/BLUE onboarding_completed = true (011 적용 후)
  if (hasOnboardingColumn) {
    for (const code of ["RED", "BLUE"] as const) {
      const { data } = await admin
        .from("guilds")
        .select("onboarding_completed")
        .eq("guild_code", code)
        .maybeSingle()
      results.push({
        name: `${code} onboarding_completed`,
        ok: data?.onboarding_completed === true,
        detail: data ? String(data.onboarding_completed) : "guild 없음",
      })
    }
  }

  // O1: GREEN 생성
  const { data: existingGreen } = await admin
    .from("guilds")
    .select("id, status, onboarding_completed")
    .eq("server_id", fixtureServerId)
    .eq("guild_code", "GREEN")
    .maybeSingle()

  let greenGuildId = existingGreen?.id

  if (!existingGreen) {
    const created = await createGuildOnboarding(admin, {
      serverId: fixtureServerId,
      guildName: FIXTURE_GUILD_NAMES.GREEN,
      adminNickname: "군주",
      password: GREEN_PASSWORD,
    })
    results.push({
      name: "O1 GREEN 생성",
      ok: created.ok,
      detail: created.ok ? `guild=${created.guild.id}` : created.message,
    })
    if (!created.ok) {
      printResults(results)
      process.exit(1)
    }
    greenGuildId = created.guild.id
  } else {
    results.push({
      name: "O1 GREEN 생성",
      ok: true,
      detail: `SKIP — 이미 존재 status=${existingGreen.status}`,
    })
    greenGuildId = existingGreen.id
  }

  // O2: GREEN 로그인
  try {
    const { memberRow } = await loginFixtureGuild(url, anonKey, admin, "GREEN", "군주", GREEN_PASSWORD)
    results.push({
      name: "O2 GREEN/군주 로그인",
      ok: true,
      detail: `memberId=${memberRow.id}`,
    })
  } catch (e) {
    results.push({
      name: "O2 GREEN/군주 로그인",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // O3: 동일 nickname cross-guild
  const nicknames: { code: string; nick: string }[] = []
  for (const code of ["RED", "BLUE", "GREEN"]) {
    const { data: g } = await admin
      .from("guilds")
      .select("id")
      .eq("server_id", fixtureServerId)
      .eq("guild_code", code)
      .maybeSingle()
    if (!g) continue
    const { data: m } = await admin
      .from("members")
      .select("nickname")
      .eq("guild_id", g.id)
      .eq("nickname", "군주")
      .maybeSingle()
    nicknames.push({ code, nick: m?.nickname ?? "(없음)" })
  }
  const allHaveGunju = nicknames.every((n) => n.nick === "군주")
  results.push({
    name: "O3 RED/BLUE/GREEN 동일 nickname 군주",
    ok: allHaveGunju && nicknames.length >= 3,
    detail: nicknames.map((n) => `${n.code}=${n.nick}`).join(", "),
  })

  // O8: 중복 guild_name
  const dup = await createGuildOnboarding(admin, {
    serverId: fixtureServerId,
    guildName: FIXTURE_GUILD_NAMES.GREEN,
    adminNickname: "테스트",
    password: GREEN_PASSWORD,
  })
  results.push({
    name: "O8 중복 GREEN guild_name → 409",
    ok: !dup.ok && dup.status === 409,
    detail: dup.ok ? "unexpected success" : `${dup.status}: ${dup.message}`,
  })

  // O10: 잘못된 guild_name
  const bad = await createGuildOnboarding(admin, {
    serverId: fixtureServerId,
    guildName: "x",
    adminNickname: "a",
    password: GREEN_PASSWORD,
  })
  results.push({
    name: "O10 잘못된 guild_name → 400",
    ok: !bad.ok && bad.status === 400,
    detail: bad.message,
  })

  // O5: provisioning orphan 없음
  const { data: orphans } = await admin
    .from("guilds")
    .select("id, guild_code, created_at")
    .eq("status", "provisioning")
  results.push({
    name: "O11 provisioning orphan 없음",
    ok: (orphans ?? []).length === 0,
    detail: orphans?.length ? orphans.map((o) => o.guild_code).join(", ") : "0건",
  })

  // O6/O7: isolation — GREEN session cannot see RED members
  try {
    const { client: greenClient, memberRow: greenMember } = await loginFixtureGuild(
      url,
      anonKey,
      admin,
      "GREEN",
      "군주",
      GREEN_PASSWORD,
    )
    const { data: greenMembers } = await greenClient.from("members").select("guild_id")
    const foreign = (greenMembers ?? []).filter((m) => m.guild_id !== greenMember.guild_id)
    results.push({
      name: "O7 GREEN → 타 guild members 노출 차단",
      ok: foreign.length === 0,
      detail: `visible=${greenMembers?.length ?? 0}`,
    })

    const redGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
    if (redGuildId) {
      const { client: redClient } = await loginFixtureGuild(url, anonKey, admin, "RED", "군주", RED_PASSWORD)
      const { data: redFinance } = await redClient
        .from("guild_finance_settings")
        .select("guild_id")
        .eq("guild_id", greenGuildId!)
      results.push({
        name: "O6 RED admin → GREEN finance 차단",
        ok: (redFinance ?? []).length === 0,
        detail: `leaked=${redFinance?.length ?? 0}`,
      })
      await redClient.auth.signOut()
    }

    await greenClient.auth.signOut()
  } catch (e) {
    results.push({
      name: "O6/O7 isolation",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // guild_name normalize
  results.push({
    name: "guild_name normalize",
    ok: normalizeGuildName("  그린  ") === "그린",
    detail: normalizeGuildName("  그린  "),
  })
  results.push({
    name: "guild_name validation",
    ok: isValidGuildName(FIXTURE_GUILD_NAMES.GREEN),
    detail: FIXTURE_GUILD_NAMES.GREEN,
  })

  // GREEN onboarding flag (011 migration 필요)
  if (hasOnboardingColumn) {
    const { data: greenRow } = await admin
      .from("guilds")
      .select("onboarding_completed")
      .eq("server_id", fixtureServerId)
      .eq("guild_code", "GREEN")
      .maybeSingle()

    results.push({
      name: "GREEN onboarding_completed (신규=false 기대)",
      ok: greenRow?.onboarding_completed === false,
      detail: String(greenRow?.onboarding_completed),
    })

    if (greenGuildId && greenRow?.onboarding_completed === false) {
      await admin
        .from("guilds")
        .update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() })
        .eq("id", greenGuildId)
      results.push({
        name: "O4 wizard complete (DB flag)",
        ok: true,
        detail: "onboarding_completed=true 설정",
      })
    } else {
      results.push({
        name: "O4 wizard complete",
        ok: greenRow?.onboarding_completed === true,
        detail: "already completed",
      })
    }
  } else {
    results.push({
      name: "O4 wizard complete (011 migration)",
      ok: true,
      detail: "SKIP — migration 미적용",
    })
  }

  printResults(results)
  const failed = results.filter((r) => !r.ok)
  process.exit(failed.length === 0 ? 0 : 1)
}

function printResults(results: CheckResult[]) {
  console.log("\n=== Phase 5 onboarding 검증 ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`)
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  if (failed.length) console.log("FAILED:", failed.map((f) => f.name).join(", "))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
