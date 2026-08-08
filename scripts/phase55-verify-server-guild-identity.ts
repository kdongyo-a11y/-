/**
 * Phase 5.5 server + guild_name identity 검증
 * 사용: npm run phase55:verify-server-guild-identity
 * 사전: 012_game_servers_guild_identity_phase55.sql 수동 실행
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { createGuildOnboarding } from "../lib/supabase/guild-onboarding-saga"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import {
  isValidGuildName,
  normalizeGuildName,
} from "../lib/guild-types"
import { fetchGameServerIdByName } from "../lib/supabase/game-server-data"
import { fetchGuildProfile } from "../lib/supabase/guild-profile-data"
import {
  fetchGuildIdByServerAndName,
  getFixtureServerId,
  loginAsServerGuild,
  loginFixtureGuild,
  FIXTURE_SERVER_NAME,
  FIXTURE_GUILD_NAMES,
} from "./test-auth-helpers"

loadEnvLocal()

const TEST_PASSWORD = "phase55test1"
const TEST_GUILD_NAME = "레드원"
const OTHER_GUILD_NAME = "블루원"
const RED_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"

const EXPECTED_SERVERS = [
  "데포루쥬", "켄라우헬", "질리언", "이실로테", "조우", "하딘", "케레니스", "오웬",
  "크리스터", "아툰", "가드리아", "군터", "아스테어", "듀크데필", "발센", "어레인",
  "캐스톨", "세바스챤", "데컨", "아인하사드", "파아그리오", "에바", "사이하", "마프르",
  "린델", "하이네", "로엔그린", "발라카스", "오렌", "안타라스", "글루디오",
]

type Check = { name: string; ok: boolean; detail: string }

async function cleanupTestGuild(
  admin: SupabaseClient,
  serverId: string,
  guildName: string,
): Promise<void> {
  const gid = await fetchGuildIdByServerAndName(admin, serverId, guildName)
  if (!gid) return
  await admin.from("contribution_score_settings").delete().eq("guild_id", gid)
  await admin.from("guild_finance_settings").delete().eq("guild_id", gid)
  const { data: members } = await admin.from("members").select("auth_user_id, id").eq("guild_id", gid)
  for (const m of members ?? []) {
    if (m.auth_user_id) await admin.auth.admin.deleteUser(m.auth_user_id).catch(() => {})
  }
  await admin.from("members").delete().eq("guild_id", gid)
  await admin.from("guilds").delete().eq("id", gid)
}

async function ensurePhase55Schema(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("game_servers").select("id").limit(1)
  if (error?.message?.includes("game_servers")) {
    console.error("\n[BLOCKED] game_servers 없음 — 012 migration 먼저 실행\n")
    return false
  }
  const { error: colErr } = await admin.from("guilds").select("server_id").limit(1)
  if (colErr?.message?.includes("server_id")) {
    console.error("\n[BLOCKED] guilds.server_id 없음 — 012 migration 먼저 실행\n")
    return false
  }
  return !error && !colErr
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: Check[] = []

  if (!(await ensurePhase55Schema(admin))) process.exit(1)

  const { data: servers } = await admin
    .from("game_servers")
    .select("id, server_name, sort_order")
    .eq("status", "active")
    .order("sort_order")

  results.push({
    name: "11 31개 서버 seed",
    ok: (servers ?? []).length === 31,
    detail: `count=${servers?.length ?? 0}`,
  })

  const names = (servers ?? []).map((s) => s.server_name)
  results.push({
    name: "11 seed 이름 순서",
    ok: JSON.stringify(names) === JSON.stringify(EXPECTED_SERVERS),
    detail: names.slice(0, 3).join(", ") + "...",
  })

  const depoId = await fetchGameServerIdByName(admin, "데포루쥬")
  const kenId = await fetchGameServerIdByName(admin, "켄라우헬")
  if (!depoId || !kenId) {
    console.error("데포루쥬/켄라우헬 server id 없음")
    process.exit(1)
  }

  // guild_name normalize policy
  results.push({
    name: "normalize trim",
    ok: normalizeGuildName("  레드원  ") === "레드원",
    detail: normalizeGuildName("  레드원  "),
  })
  results.push({
    name: "normalize 연속 공백",
    ok: normalizeGuildName("레드  원") === "레드 원",
    detail: normalizeGuildName("레드  원"),
  })
  results.push({
    name: "valid 한글+영문+숫자",
    ok: isValidGuildName("레드One 1"),
    detail: String(isValidGuildName("레드One 1")),
  })
  results.push({
    name: "invalid 특수문자",
    ok: !isValidGuildName("레드-원"),
    detail: String(isValidGuildName("레드-원")),
  })

  for (const sid of [depoId, kenId]) {
    await cleanupTestGuild(admin, sid, TEST_GUILD_NAME)
    await cleanupTestGuild(admin, sid, OTHER_GUILD_NAME)
  }

  // 1. 데포루쥬 + 레드원 생성
  const depoCreate = await createGuildOnboarding(admin, {
    serverId: depoId,
    guildName: TEST_GUILD_NAME,
    adminNickname: "군주",
    password: TEST_PASSWORD,
  })
  results.push({
    name: "1 데포루쥬+레드원 생성",
    ok: depoCreate.ok,
    detail: depoCreate.ok ? depoCreate.guild.id : depoCreate.message,
  })

  // 2. 켄라우헬 + 레드원 생성 (다른 guild_id)
  const kenCreate = await createGuildOnboarding(admin, {
    serverId: kenId,
    guildName: TEST_GUILD_NAME,
    adminNickname: "군주",
    password: TEST_PASSWORD,
  })
  results.push({
    name: "2 켄라우헬+레드원 생성",
    ok: kenCreate.ok,
    detail: kenCreate.ok ? kenCreate.guild.id : kenCreate.message,
  })
  results.push({
    name: "2 서로 다른 guild_id",
    ok:
      depoCreate.ok &&
      kenCreate.ok &&
      depoCreate.guild.id !== kenCreate.guild.id,
    detail:
      depoCreate.ok && kenCreate.ok
        ? `${depoCreate.guild.id.slice(0, 8)} vs ${kenCreate.guild.id.slice(0, 8)}`
        : "skip",
  })

  // 3. 데포루쥬 + 레드원 중복 → 409
  const dup = await createGuildOnboarding(admin, {
    serverId: depoId,
    guildName: TEST_GUILD_NAME,
    adminNickname: "other",
    password: TEST_PASSWORD,
  })
  results.push({
    name: "3 데포루쥬+레드원 중복 409",
    ok: !dup.ok && dup.status === 409,
    detail: dup.ok ? "unexpected" : `${dup.status}: ${dup.message}`,
  })

  // 4-5. login both
  try {
    const depoLogin = await loginAsServerGuild(
      url,
      anonKey,
      admin,
      depoId,
      TEST_GUILD_NAME,
      "군주",
      TEST_PASSWORD,
    )
    const kenLogin = await loginAsServerGuild(
      url,
      anonKey,
      admin,
      kenId,
      TEST_GUILD_NAME,
      "군주",
      TEST_PASSWORD,
    )
    results.push({
      name: "4 데포루쥬+레드원+군주 로그인",
      ok: true,
      detail: depoLogin.memberRow.guild_id,
    })
    results.push({
      name: "5 켄라우헬+레드원+군주 로그인 (다른 guild_id)",
      ok: depoLogin.memberRow.guild_id !== kenLogin.memberRow.guild_id,
      detail: `${depoLogin.memberRow.guild_id.slice(0, 8)} vs ${kenLogin.memberRow.guild_id.slice(0, 8)}`,
    })
    await depoLogin.client.auth.signOut()
    await kenLogin.client.auth.signOut()
  } catch (e) {
    results.push({
      name: "4-5 login",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // 6. 잘못된 server + 레드원 로그인 실패
  const fakeServerId = "00000000-0000-0000-0000-000000000099"
  const wrongServerMember = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fakeServerId,
    TEST_GUILD_NAME,
    "군주",
  )
  results.push({
    name: "6 잘못된 server 로그인 실패",
    ok: wrongServerMember === null,
    detail: wrongServerMember ? "unexpected found" : "null",
  })

  // 7. 같은 서버 + 다른 혈맹명 독립 tenant
  const otherCreate = await createGuildOnboarding(admin, {
    serverId: depoId,
    guildName: OTHER_GUILD_NAME,
    adminNickname: "군주",
    password: TEST_PASSWORD,
  })
  results.push({
    name: "7 데포루쥬+블루원 독립 생성",
    ok: otherCreate.ok,
    detail: otherCreate.ok ? otherCreate.guild.id : otherCreate.message,
  })
  if (otherCreate.ok && depoCreate.ok) {
    results.push({
      name: "7 다른 guild_id (레드원 vs 블루원)",
      ok: otherCreate.guild.id !== depoCreate.guild.id,
      detail: `${depoCreate.guild.id.slice(0, 8)} vs ${otherCreate.guild.id.slice(0, 8)}`,
    })
  }

  // 8. profile guild_name + server_name
  if (depoCreate.ok) {
    const profile = await fetchGuildProfile(admin, depoCreate.guild.id)
    results.push({
      name: "8 profile guild_name + server_name",
      ok: profile?.guildName === TEST_GUILD_NAME && profile?.serverName === "데포루쥬",
      detail: profile ? `${profile.guildName} / ${profile.serverName}` : "missing",
    })
  }

  // fixture RED login by guild_name
  try {
    const fixtureServerId = await getFixtureServerId(admin)
    const { client: redClient, memberRow: redMember } = await loginFixtureGuild(
      url,
      anonKey,
      admin,
      "RED",
      "군주",
      RED_PASSWORD,
    )
    results.push({
      name: `fixture RED (${FIXTURE_GUILD_NAMES.RED}) 로그인`,
      ok: true,
      detail: redMember.guild_id,
    })
    results.push({
      name: "fixture on 데포루쥬",
      ok: fixtureServerId === depoId,
      detail: FIXTURE_SERVER_NAME,
    })
    const { data: members } = await redClient.from("members").select("guild_id")
    const foreign = (members ?? []).filter((m) => m.guild_id !== redMember.guild_id)
    results.push({
      name: "tenant isolation (RED session)",
      ok: foreign.length === 0,
      detail: `visible=${members?.length ?? 0}`,
    })
    await redClient.auth.signOut()
  } catch (e) {
    results.push({
      name: "fixture RED login",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  printResults(results)
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

function printResults(results: Check[]) {
  console.log("\n=== Phase 5.5 server/guild_name identity 검증 ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`)
  }
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
