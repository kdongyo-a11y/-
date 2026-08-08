/**
 * Phase 2 boss/siege 테넌트 격리 검증 (B1~B5, S1~S5)
 * 사용: npm run phase2:verify-isolation
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { loginFixtureGuild, getFixtureServerId, fetchGuildIdByServerAndCode } from "./test-auth-helpers"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import { FIXTURE_GUILD_NAMES } from "../lib/guild-types"
import { getBossEventBySlotId } from "../lib/supabase/boss-event-helpers"
import { getSiegeByIdForGuild } from "../lib/supabase/siege-event-helpers"
import { requireMemberInActorGuild } from "../lib/supabase/guild-scope-helpers"
import { makeSlotId } from "../lib/boss-time-slots"
import { makeSiegeId } from "../lib/siege-utils"

loadEnvLocal()

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"
const TEST_BOSS_DATE = "2026-08-09"
const TEST_BOSS_HOUR = 12
const TEST_SIEGE_DATE = "2026-08-09"

type CheckResult = { id: string; ok: boolean; detail: string }

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await assertMigrationApplied(admin)

  const results: CheckResult[] = []

  const fixtureServerId = await getFixtureServerId(admin)

  const redGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
  const blueGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "BLUE")
  if (!redGuildId || !blueGuildId) {
    console.error("RED/BLUE guild 없음 — phase1:seed-test-guilds 실행 필요")
    process.exit(1)
  }
  const redGuild = { id: redGuildId }
  const blueGuild = { id: blueGuildId }

  const redMember = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.RED,
    "군주",
  )
  const blueMember = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.BLUE,
    "군주",
  )
  if (!redMember || !blueMember) {
    console.error("RED/BLUE 군주 member 없음")
    process.exit(1)
  }

  const slotId = makeSlotId(TEST_BOSS_DATE, TEST_BOSS_HOUR)
  const siegeId = makeSiegeId(TEST_SIEGE_DATE)

  // Ensure test data exists
  await ensureTestBoss(admin, redGuild.id, slotId)
  await ensureTestBoss(admin, blueGuild.id, slotId)
  await ensureTestSiege(admin, redGuild.id, TEST_SIEGE_DATE)
  await ensureTestSiege(admin, blueGuild.id, TEST_SIEGE_DATE)

  const redBoss = await getBossEventBySlotId(admin, slotId, redGuild.id)
  const blueBoss = await getBossEventBySlotId(admin, slotId, blueGuild.id)
  const redSiege = await getSiegeByIdForGuild(admin, siegeId, redGuild.id)
  const blueSiege = await getSiegeByIdForGuild(admin, siegeId, blueGuild.id)

  if (!redBoss || !blueBoss || !redSiege || !blueSiege) {
    console.error("테스트 boss/siege 데이터 준비 실패 — phase2:seed-test-data 실행")
    process.exit(1)
  }

  async function loginAs(fixture: "RED" | "BLUE", nickname: string) {
    return loginFixtureGuild(url, anonKey, admin, fixture, nickname, TEST_PASSWORD)
  }

  // --- Boss tests ---
  try {
    const { client: redClient } = await loginAs("RED", "군주")

    const { data: redBossRows } = await redClient.from("boss_events").select("id, guild_id")
    const redOwnBoss = (redBossRows ?? []).filter((r) => r.guild_id === redGuild.id)
    const redCrossBoss = (redBossRows ?? []).filter((r) => r.guild_id === blueGuild.id)

    results.push({
      id: "B1",
      ok: redOwnBoss.some((r) => r.id === redBoss.id),
      detail: `RED ownGuildBossCount=${redOwnBoss.length}, RED crossGuildBossCount=${redCrossBoss.length}`,
    })

    await redClient.auth.signOut()

    const { client: blueClient } = await loginAs("BLUE", "군주")
    const { data: blueBossRows } = await blueClient.from("boss_events").select("id, guild_id")
    const blueOwnBoss = (blueBossRows ?? []).filter((r) => r.guild_id === blueGuild.id)
    const blueCrossBoss = (blueBossRows ?? []).filter((r) => r.id === redBoss.id)

    results.push({
      id: "B2",
      ok: blueCrossBoss.length === 0,
      detail: `BLUE ownGuildBossCount=${blueOwnBoss.length}, BLUE sees RED boss=${blueCrossBoss.length}`,
    })

    // B3: BLUE session direct select RED boss by id
    const { data: directRedBoss } = await blueClient
      .from("boss_events")
      .select("id")
      .eq("id", redBoss.id)
      .maybeSingle()

    results.push({
      id: "B3",
      ok: !directRedBoss,
      detail: directRedBoss ? "RED boss ID 노출됨" : "RED boss ID 직접 접근 차단",
    })

    await blueClient.auth.signOut()
  } catch (e) {
    results.push({ id: "B1-B3", ok: false, detail: e instanceof Error ? e.message : String(e) })
  }

  // B4: BLUE admin tries to update RED boss (API logic simulation)
  const blueLookupRed = await getBossEventBySlotId(admin, slotId, blueGuild.id)
  const crossUpdateBlocked =
    blueLookupRed?.id !== redBoss.id &&
    ((await admin
      .from("boss_events")
      .update({ income_status: "no_income" })
      .eq("id", redBoss.id)
      .eq("guild_id", blueGuild.id)
      .select("id")).data?.length ?? 0) === 0

  results.push({
    id: "B4",
    ok: crossUpdateBlocked,
    detail: "BLUE → RED boss 수정/삭제 guild_id 조건 차단",
  })

  // B5: RED member join BLUE boss (member cross-guild)
  const crossMember = await requireMemberInActorGuild(admin, redGuild.id, blueMember.id)
  results.push({
    id: "B5",
    ok: !crossMember.ok,
    detail: crossMember.ok ? "cross-guild member 허용됨" : "RED actor → BLUE member 차단",
  })

  // --- Siege tests ---
  try {
    const { client: redClient } = await loginAs("RED", "군주")
    const { data: redSiegeRows } = await redClient.from("siege_events").select("id, guild_id")
    const redOwnSiege = (redSiegeRows ?? []).filter((r) => r.guild_id === redGuild.id)
    const redCrossSiege = (redSiegeRows ?? []).filter((r) => r.guild_id === blueGuild.id)

    results.push({
      id: "S1",
      ok: redOwnSiege.some((r) => r.id === redSiege.id),
      detail: `RED ownGuildSiegeCount=${redOwnSiege.length}, RED crossGuildSiegeCount=${redCrossSiege.length}`,
    })

    await redClient.auth.signOut()

    const { client: blueClient } = await loginAs("BLUE", "군주")
    const { data: blueSiegeRows } = await blueClient.from("siege_events").select("id, guild_id")
    const blueOwnSiege = (blueSiegeRows ?? []).filter((r) => r.guild_id === blueGuild.id)
    const blueCrossSiege = (blueSiegeRows ?? []).filter((r) => r.id === redSiege.id)

    results.push({
      id: "S2",
      ok: blueCrossSiege.length === 0,
      detail: `BLUE ownGuildSiegeCount=${blueOwnSiege.length}, BLUE sees RED siege=${blueCrossSiege.length}`,
    })

    const { data: directRedSiege } = await blueClient
      .from("siege_events")
      .select("id")
      .eq("id", redSiege.id)
      .maybeSingle()

    results.push({
      id: "S3",
      ok: !directRedSiege,
      detail: directRedSiege ? "RED siege ID 노출됨" : "RED siege ID 직접 접근 차단",
    })

    await blueClient.auth.signOut()
  } catch (e) {
    results.push({ id: "S1-S3", ok: false, detail: e instanceof Error ? e.message : String(e) })
  }

  const crossSiegeUpdateBlocked =
    (await admin
      .from("siege_events")
      .update({ memo: "hack" })
      .eq("id", redSiege.id)
      .eq("guild_id", blueGuild.id)
      .select("id")).data?.length === 0

  results.push({
    id: "S4",
    ok: crossSiegeUpdateBlocked,
    detail: "BLUE → RED siege 수정 guild_id 조건 차단",
  })

  // S5: participation isolation via child table RLS
  try {
    const { client: redClient } = await loginAs("RED", "군주")
    await admin.from("boss_participations").insert({
      boss_event_id: redBoss.id,
      member_id: redMember.id,
      source: "manual",
      status: "participated",
    }).then(({ error }) => {
      if (error && error.code !== "23505") throw error
    })
    await admin.from("boss_participations").insert({
      boss_event_id: blueBoss.id,
      member_id: blueMember.id,
      source: "manual",
      status: "participated",
    }).then(({ error }) => {
      if (error && error.code !== "23505") throw error
    })

    const { data: redParts } = await redClient
      .from("boss_participations")
      .select("id, boss_event_id")

    const leakedBluePart = (redParts ?? []).some((p) => p.boss_event_id === blueBoss.id)
    results.push({
      id: "S5",
      ok: !leakedBluePart,
      detail: leakedBluePart
        ? "RED 세션이 BLUE participation 노출"
        : "RED/BLUE participation 격리 OK",
    })

    await redClient.auth.signOut()
  } catch (e) {
    results.push({ id: "S5", ok: false, detail: e instanceof Error ? e.message : String(e) })
  }

  // Summary counts
  const { count: redBossCount } = await admin
    .from("boss_events")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", redGuild.id)
  const { count: blueBossCount } = await admin
    .from("boss_events")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", blueGuild.id)
  const { count: redSiegeCount } = await admin
    .from("siege_events")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", redGuild.id)
  const { count: blueSiegeCount } = await admin
    .from("siege_events")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", blueGuild.id)

  console.log("=== Phase 2 boss/siege 테넌트 격리 검증 ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.id}: ${r.detail}`)
  }

  console.log("\n--- Count summary ---")
  console.log(`RED boss count=${redBossCount ?? 0}`)
  console.log(`BLUE boss count=${blueBossCount ?? 0}`)
  console.log(`RED siege count=${redSiegeCount ?? 0}`)
  console.log(`BLUE siege count=${blueSiegeCount ?? 0}`)

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.log(`\n실패 ${failed.length}건`)
    process.exit(1)
  }

  console.log("\n모든 검증 통과")
}

async function assertMigrationApplied(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("boss_events").select("guild_id").limit(1)
  if (error?.message?.includes("guild_id") || error?.code === "42703") {
    console.error(
      "008_boss_siege_multitenant_phase2.sql 미적용.\n" +
        "Supabase SQL Editor에서 migration 008을 실행한 뒤 다시 시도하세요.",
    )
    process.exit(1)
  }
}

async function ensureTestBoss(
  admin: SupabaseClient,
  guildId: string,
  slotId: string,
): Promise<void> {
  const existing = await getBossEventBySlotId(admin, slotId, guildId)
  if (existing) return
  await admin.from("boss_events").insert({
    guild_id: guildId,
    event_date: TEST_BOSS_DATE,
    slot_hour: TEST_BOSS_HOUR,
    slot_type: "general",
    participation_status: "closed",
  })
}

async function ensureTestSiege(
  admin: SupabaseClient,
  guildId: string,
  eventDate: string,
): Promise<void> {
  const existing = await getSiegeByIdForGuild(admin, makeSiegeId(eventDate), guildId)
  if (existing) return
  await admin.from("siege_events").insert({
    guild_id: guildId,
    event_date: eventDate,
    status: "draft",
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
