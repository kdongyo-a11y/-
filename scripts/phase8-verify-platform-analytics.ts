/**
 * Phase 8 — Platform Admin usage analytics (fixture integration test)
 * 사용: npm run phase8:verify-platform-analytics
 *
 * 대상: RED/BLUE fixture가 있는 **개발/테스트 Supabase** (.env.local)
 * Production 검증: npm run phase8:verify-platform-production (.env.production.local)
 *
 * 사전: 015 migration 적용, phase1:seed-test-guilds (fixture DB만)
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvFile, requireEnv } from "./load-env-file"

if (!loadEnvFile(".env.local")) {
  console.error(".env.local 없음.")
  console.error("  → Production 검증: npm run phase8:verify-platform-production")
  console.error("  → Fixture integration: .env.local에 개발 Supabase 키 설정 후 재실행")
  process.exit(1)
}
import {
  loginFixtureGuild,
  loginAsServerGuild,
  getFixtureServerId,
  fetchGuildIdByServerAndCode,
  FIXTURE_GUILD_NAMES,
} from "./test-auth-helpers"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import { requireAdmin } from "../lib/supabase/operation-auth"
import { requirePlatformAdminFromClient } from "../lib/platform/platform-admin-auth"
import {
  recordUsageEvent,
  setUsageEventForceFailForTesting,
} from "../lib/platform/usage-events"
import { sanitizeUsageMetadata } from "../lib/platform/usage-event-types"
import { computeGuildStatus, fetchPlatformKpis } from "../lib/platform/platform-analytics"
import { resolveAdminPeriod } from "../lib/admin-data/period-utils"
import { fetchGuildScopedSnapshot } from "../lib/admin-data/guild-scoped-data"
import { execSync } from "child_process"

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"

type Check = { id: string; ok: boolean; detail: string }

async function assertEnvReachable(url: string): Promise<boolean> {
  try {
    const host = new URL(url).hostname
    const { lookup } = await import("dns/promises")
    await lookup(host)
    return true
  } catch {
    return false
  }
}

async function tableExists(admin: SupabaseClient, table: string): Promise<boolean> {
  const { error } = await admin.from(table).select("id", { count: "exact", head: true })
  if (!error) return true
  if (error.code === "42P01") return false
  throw error
}

async function ensureTestPlatformAdmin(
  admin: SupabaseClient,
  authUserId: string,
  displayName: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("platform_admins")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (existing) {
    await admin
      .from("platform_admins")
      .update({ status: "active", display_name: displayName })
      .eq("auth_user_id", authUserId)
    return
  }

  const { error } = await admin.from("platform_admins").insert({
    auth_user_id: authUserId,
    display_name: displayName,
    status: "active",
  })
  if (error) throw error
}

async function removeTestPlatformAdmin(admin: SupabaseClient, authUserId: string): Promise<void> {
  await admin.from("platform_admins").delete().eq("auth_user_id", authUserId)
}

async function countLoginEvents(
  admin: SupabaseClient,
  memberId: string,
  since?: string,
): Promise<number> {
  let query = admin
    .from("usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "login_success")
    .eq("member_id", memberId)

  if (since) query = query.gte("created_at", since)
  const { count } = await query
  return count ?? 0
}

async function countDistinctLoginUsers(
  admin: SupabaseClient,
  guildId: string,
  since: string,
): Promise<number> {
  const { data } = await admin
    .from("usage_events")
    .select("member_id")
    .eq("event_type", "login_success")
    .eq("guild_id", guildId)
    .gte("created_at", since)

  return new Set((data ?? []).map((r) => r.member_id).filter(Boolean)).size
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")

  if (!(await assertEnvReachable(url))) {
    console.error("\n[SKIP] fixture integration test — Supabase host unreachable (.env.local)")
    console.error(`  URL host: ${new URL(url).hostname}`)
    console.error("  .env.local may point to a deleted test Supabase project (stale env).")
    console.error("  → Production 검증: npm run phase8:verify-platform-production")
    console.error("  → Fixture integration: 새 개발 Supabase 키로 .env.local 설정 후 재실행\n")
    process.exit(0)
  }

  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: Check[] = []

  const hasPlatformAdmins = await tableExists(admin, "platform_admins")
  const hasUsageEvents = await tableExists(admin, "usage_events")

  results.push({
    id: "M0",
    ok: hasPlatformAdmins && hasUsageEvents,
    detail:
      hasPlatformAdmins && hasUsageEvents
        ? "015 migration tables present"
        : "015 migration NOT applied — apply 015_platform_usage_analytics.sql first",
  })

  if (!hasPlatformAdmins || !hasUsageEvents) {
    printResults(results)
    process.exit(1)
  }

  const fixtureServerId = await getFixtureServerId(admin).catch(() => null)
  const redGuildId = fixtureServerId
    ? await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
    : null
  const blueGuildId = fixtureServerId
    ? await fetchGuildIdByServerAndCode(admin, fixtureServerId, "BLUE")
    : null

  if (!fixtureServerId || !redGuildId || !blueGuildId) {
    console.error("\n[SKIP] fixture integration test — production clean DB (RED/BLUE fixture 없음)")
    console.error("  Production DB에 fixture seed 하지 마세요.")
    console.error("  → Production 검증: npm run phase8:verify-platform-production\n")
    printResults(results)
    process.exit(0)
  }

  const redAdminRow = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.RED,
    "군주",
  )

  if (!redAdminRow) {
    console.error("RED fixture admin missing")
    process.exit(1)
  }

  const { data: nonAdminMember } = await admin
    .from("members")
    .select("nickname, guild_id, role, auth_user_id")
    .in("role", ["member", "manager"])
    .not("auth_user_id", "is", null)
    .limit(1)
    .maybeSingle()

  // P1: guild admin (RED 군주) → platform 403 (platform admin 등록 전)
  const redAdminLogin = await loginFixtureGuild(
    url,
    anonKey,
    admin,
    "RED",
    "군주",
    TEST_PASSWORD,
  )
  const p1 = await requirePlatformAdminFromClient(redAdminLogin.client)
  results.push({
    id: "P1",
    ok: !p1.ok && p1.status === 403,
    detail: p1.ok ? "guild admin allowed platform" : `blocked: ${p1.message}`,
  })
  await redAdminLogin.client.auth.signOut()

  // P2: manager/member → 403
  if (nonAdminMember?.nickname && nonAdminMember.auth_user_id) {
    const { data: guildRow } = await admin
      .from("guilds")
      .select("guild_name, server_id")
      .eq("id", nonAdminMember.guild_id)
      .single()

    const guildName = guildRow?.guild_name ?? FIXTURE_GUILD_NAMES.RED
    const memberLogin = await loginAsServerGuild(
      url,
      anonKey,
      admin,
      guildRow?.server_id ?? fixtureServerId,
      guildName,
      nonAdminMember.nickname,
      TEST_PASSWORD,
    ).catch(() => null)

    if (memberLogin) {
      const p2 = await requirePlatformAdminFromClient(memberLogin.client)
      results.push({
        id: "P2",
        ok: !p2.ok && p2.status === 403,
        detail: p2.ok
          ? `${nonAdminMember.role} allowed platform`
          : `${nonAdminMember.role} blocked: ${p2.message}`,
      })
      await memberLogin.client.auth.signOut()
    } else {
      results.push({
        id: "P2",
        ok: false,
        detail: `could not login as ${nonAdminMember.role}/${nonAdminMember.nickname}`,
      })
    }
  } else {
    results.push({
      id: "P2",
      ok: true,
      detail: "skipped — no member/manager fixture (guild admin 403 covered by P1)",
    })
  }

  // P3: platform admin → 200 (RED 군주를 platform admin으로 등록 — guild admin과 별도)
  await ensureTestPlatformAdmin(admin, redAdminRow.auth_user_id!, "Phase8 Test Operator")

  const platformLogin = await loginFixtureGuild(
    url,
    anonKey,
    admin,
    "RED",
    "군주",
    TEST_PASSWORD,
  )
  const p3 = await requirePlatformAdminFromClient(platformLogin.client)
  results.push({
    id: "P3",
    ok: p3.ok,
    detail: p3.ok ? `platform admin OK: ${p3.platformAdmin.display_name}` : p3.message,
  })

  // P4/P5: login_success events
  const testMarker = `phase8-${Date.now()}`
  const beforeCount = await countLoginEvents(admin, redAdminRow.id)

  for (let i = 0; i < 5; i++) {
    await recordUsageEvent(
      {
        eventType: "login_success",
        guildId: redGuildId,
        memberId: redAdminRow.id,
        metadata: { marker: testMarker, attempt: i + 1 },
      },
      admin,
    )
  }

  const afterCount = await countLoginEvents(admin, redAdminRow.id)
  const markerEvents = await admin
    .from("usage_events")
    .select("id")
    .eq("event_type", "login_success")
    .eq("member_id", redAdminRow.id)
    .contains("metadata", { marker: testMarker })

  results.push({
    id: "P4",
    ok: (markerEvents.data?.length ?? 0) >= 5,
    detail: `login_success recorded: +${afterCount - beforeCount} (marker=${markerEvents.data?.length ?? 0})`,
  })

  results.push({
    id: "P5",
    ok: (markerEvents.data?.length ?? 0) === 5,
    detail: `5 events for same member, distinct user count logic uses member_id`,
  })

  // P6: RED/BLUE activity isolation in events
  const since = new Date(Date.now() - 60_000).toISOString()
  await recordUsageEvent(
    { eventType: "boss_participation", guildId: redGuildId, memberId: redAdminRow.id },
    admin,
  )
  await recordUsageEvent(
    { eventType: "boss_participation", guildId: blueGuildId, memberId: redAdminRow.id },
    admin,
  )

  const { count: redBoss } = await admin
    .from("usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "boss_participation")
    .eq("guild_id", redGuildId)
    .gte("created_at", since)

  const { count: blueBoss } = await admin
    .from("usage_events")
    .select("*", { count: "exact", head: true })
    .eq("event_type", "boss_participation")
    .eq("guild_id", blueGuildId)
    .gte("created_at", since)

  results.push({
    id: "P6",
    ok: (redBoss ?? 0) >= 1 && (blueBoss ?? 0) >= 1,
    detail: `RED boss=${redBoss ?? 0}, BLUE boss=${blueBoss ?? 0}`,
  })

  // P7: platform KPI aggregates all guilds
  const kpis = await fetchPlatformKpis(admin)
  results.push({
    id: "P7",
    ok: kpis.totalGuilds >= 2 && kpis.totalMembers > 0,
    detail: `totalGuilds=${kpis.totalGuilds}, totalMembers=${kpis.totalMembers}`,
  })

  // P8: guild admin dashboard still guild-scoped
  const guildAdminCheck = requireAdmin(redAdminRow)
  const period = resolveAdminPeriod("this_month")
  const redSnapshot = await fetchGuildScopedSnapshot(admin, redGuildId, period)
  const blueSnapshot = await fetchGuildScopedSnapshot(admin, blueGuildId, period)

  results.push({
    id: "P8",
    ok:
      guildAdminCheck.ok &&
      redSnapshot.identity.guildName === FIXTURE_GUILD_NAMES.RED &&
      blueSnapshot.identity.guildName === FIXTURE_GUILD_NAMES.BLUE,
    detail: `RED=${redSnapshot.identity.guildName}, BLUE=${blueSnapshot.identity.guildName} (scoped)`,
  })

  // P9: usage event failure does not block login flow
  setUsageEventForceFailForTesting(true)
  const loginBeforeFail = await loginFixtureGuild(
    url,
    anonKey,
    admin,
    "RED",
    "군주",
    TEST_PASSWORD,
  )
  setUsageEventForceFailForTesting(false)
  results.push({
    id: "P9",
    ok: !!loginBeforeFail.memberRow,
    detail: "login succeeded with usage event force-fail",
  })
  await loginBeforeFail.client.auth.signOut()

  // P10: no PII in metadata
  const sanitized = sanitizeUsageMetadata({
    slotType: "main",
    password: "secret",
    check_code: "ABC123",
    internal_email: "x@internal",
    auth_user_id: "uuid",
    nickname: "캐릭터",
    datasetCount: 3,
  })
  const p10ok =
    sanitized !== null &&
    sanitized.slotType === "main" &&
    sanitized.datasetCount === 3 &&
    !("password" in sanitized) &&
    !("check_code" in sanitized) &&
    !("internal_email" in sanitized) &&
    !("nickname" in sanitized)

  results.push({
    id: "P10",
    ok: p10ok,
    detail: p10ok ? `sanitized keys: ${Object.keys(sanitized!).join(",")}` : "PII leaked",
  })

  // P11: guild status calculation
  const now = Date.now()
  const p11a = computeGuildStatus(new Date(now - 3 * 86400000).toISOString()) === "active"
  const p11b = computeGuildStatus(new Date(now - 15 * 86400000).toISOString()) === "low_activity"
  const p11c = computeGuildStatus(new Date(now - 35 * 86400000).toISOString()) === "unused"
  const p11d = computeGuildStatus(null) === "unused"
  results.push({
    id: "P11",
    ok: p11a && p11b && p11c && p11d,
    detail: `active=${p11a}, low=${p11b}, unused30d=${p11c}, null=${p11d}`,
  })

  // Cleanup test platform admin
  await removeTestPlatformAdmin(admin, redAdminRow.auth_user_id!)
  await platformLogin.client.auth.signOut()

  // P12: build
  try {
    execSync("npm run build", { stdio: "pipe", cwd: process.cwd() })
    results.push({ id: "P12", ok: true, detail: "npm run build PASS" })
  } catch (e) {
    const err = e as { stderr?: Buffer }
    results.push({
      id: "P12",
      ok: false,
      detail: `build FAIL: ${err.stderr?.toString().slice(0, 200) ?? "unknown"}`,
    })
  }

  printResults(results)

  const failed = results.filter((r) => !r.ok)
  process.exit(failed.length > 0 ? 1 : 0)
}

function printResults(results: Check[]) {
  console.log("\n=== Phase 8 Platform Analytics Verify ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.id}: ${r.detail}`)
  }
  const passed = results.filter((r) => r.ok).length
  console.log(`\n${passed}/${results.length} passed\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
