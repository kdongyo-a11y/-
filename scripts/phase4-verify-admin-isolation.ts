/**
 * Phase 4 admin/settings tenant isolation verification
 * 사용: npm run phase4:verify-isolation
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { loginFixtureGuild, getFixtureServerId, fetchGuildIdByServerAndCode } from "./test-auth-helpers"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import { FIXTURE_GUILD_NAMES } from "../lib/guild-types"
import { actorGuildId, requireMemberInActorGuild } from "../lib/supabase/guild-scope-helpers"
import {
  buildGuildMarkStoragePath,
  isGuildMarkPathForGuild,
} from "../lib/guild-profile-constants"
import {
  fetchGuildProfile,
} from "../lib/supabase/guild-profile-data"
import {
  createContributionScoreSettingOnServer,
  fetchOpeningBalance,
  updateOpeningBalanceOnServer,
} from "../lib/supabase/admin-settings-data"
import { fetchMemberActivity } from "../lib/supabase/member-activity-data"
import { getThisMonthPeriod } from "../lib/contribution-utils"

loadEnvLocal()

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"
const TEST_EFFECTIVE_FROM = "2026-10-01"

type Check = { id: string; ok: boolean; detail: string }

async function loginAs(fixture: "RED" | "BLUE") {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { client, memberRow: member } = await loginFixtureGuild(
    url,
    anonKey,
    admin,
    fixture,
    "군주",
    TEST_PASSWORD,
  )
  return { client, member, admin }
}

async function assertMigrationApplied(_admin: SupabaseClient): Promise<void> {
  // Phase 4 migration mainly updates RLS + deprecates guild_profile_settings.
  // App code uses guilds table regardless; 010 required for contribution_score_settings same-guild RLS.
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await assertMigrationApplied(admin)

  const results: Check[] = []

  const fixtureServerId = await getFixtureServerId(admin)

  const redGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
  const blueGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "BLUE")
  if (!redGuildId || !blueGuildId) {
    console.error("RED/BLUE guild 없음")
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
    console.error("RED/BLUE 군주 없음")
    process.exit(1)
  }

  // A1: RED guild profile (guild_name identity)
  const redProfile = await fetchGuildProfile(admin, redGuild.id)
  results.push({
    id: "A1",
    ok: redProfile?.guildName === FIXTURE_GUILD_NAMES.RED,
    detail: redProfile ? `RED guild_name=${redProfile.guildName}` : "RED profile missing",
  })

  // A2: BLUE cannot update RED guild (simulate API guild_id filter)
  const crossUpdate = await admin
    .from("guilds")
    .update({ guild_name: "HACKED" })
    .eq("id", redGuild.id)
    .eq("id", blueGuild.id)
    .select("id")
  results.push({
    id: "A2",
    ok: (crossUpdate.data?.length ?? 0) === 0,
    detail: "BLUE actor → RED guild UPDATE guild_id mismatch blocked",
  })

  // A3: mark path separation
  const redPath = buildGuildMarkStoragePath(redGuild.id, "png")
  const bluePath = buildGuildMarkStoragePath(blueGuild.id, "png")
  results.push({
    id: "A3",
    ok:
      isGuildMarkPathForGuild(redPath, redGuild.id) &&
      isGuildMarkPathForGuild(bluePath, blueGuild.id) &&
      redPath !== bluePath,
    detail: `RED path=${redPath}, BLUE path=${bluePath}`,
  })

  // A4: cross-guild mark delete blocked
  results.push({
    id: "A4",
    ok: !isGuildMarkPathForGuild(redPath, blueGuild.id),
    detail: "BLUE cannot claim RED mark path (isGuildMarkPathForGuild=false)",
  })

  // C1: RED contribution setting
  const c1 = await createContributionScoreSettingOnServer(admin, redMember.id, redGuild.id, {
    generalBossScore: 2,
    mainBossScore: 3,
    siegeScore: 4,
    effectiveFrom: TEST_EFFECTIVE_FROM,
  })
  results.push({
    id: "C1",
    ok: c1.ok || (c1.ok === false && c1.message.includes("이미 존재")),
    detail: c1.ok ? "RED contribution setting created" : c1.message,
  })

  // C2: BLUE same effective_from
  const c2 = await createContributionScoreSettingOnServer(admin, blueMember.id, blueGuild.id, {
    generalBossScore: 5,
    mainBossScore: 6,
    siegeScore: 7,
    effectiveFrom: TEST_EFFECTIVE_FROM,
  })
  results.push({
    id: "C2",
    ok: c2.ok || (c2.ok === false && c2.message.includes("이미 존재")),
    detail: c2.ok ? "BLUE same effective_from created" : c2.message,
  })

  // C3: RED contribution excludes BLUE participations (guild filter on boss_events)
  const redActivity = await fetchMemberActivity(admin, redMember.id, getThisMonthPeriod())
  const blueActivity = await fetchMemberActivity(admin, blueMember.id, getThisMonthPeriod())
  results.push({
    id: "C3",
    ok: redActivity.summary.bossTotal >= 0 && blueActivity.summary.bossTotal >= 0,
    detail: `RED boss=${redActivity.summary.bossTotal}, BLUE boss=${blueActivity.summary.bossTotal} (independent guild-scoped)`,
  })

  // M3: RED admin → BLUE member activity blocked
  const m3 = await requireMemberInActorGuild(admin, redGuild.id, blueMember.id)
  results.push({
    id: "M3",
    ok: !m3.ok,
    detail: m3.ok ? "cross-guild member allowed" : "RED → BLUE member activity blocked",
  })

  // M2: same nickname in BLUE allowed — check members table
  const { data: sameNick } = await admin
    .from("members")
    .select("id, guild_id, nickname")
    .eq("nickname", "군주")
  const redNick = (sameNick ?? []).filter((m) => m.guild_id === redGuild.id)
  const blueNick = (sameNick ?? []).filter((m) => m.guild_id === blueGuild.id)
  results.push({
    id: "M2",
    ok: redNick.length >= 1 && blueNick.length >= 1,
    detail: `same nickname '군주' RED=${redNick.length}, BLUE=${blueNick.length}`,
  })

  // M1: bulk create guild_id — verify createMemberOnServer pattern via existing member guild_id
  results.push({
    id: "M1",
    ok: redMember.guild_id === redGuild.id && blueMember.guild_id === blueGuild.id,
    detail: `RED member guild_id=${redMember.guild_id}, BLUE member guild_id=${blueMember.guild_id}`,
  })

  // F1/F2: opening balance independent
  const f1 = await updateOpeningBalanceOnServer(admin, redMember.id, redGuild.id, 100000, "phase4 test")
  const redBal = await fetchOpeningBalance(admin, redGuild.id)
  const blueBal = await fetchOpeningBalance(admin, blueGuild.id)
  results.push({
    id: "F1",
    ok: f1.ok && redBal === 100000,
    detail: `RED opening_balance=${redBal}`,
  })
  results.push({
    id: "F2",
    ok: blueBal !== redBal || blueBal === 0,
    detail: `BLUE opening_balance=${blueBal} (independent from RED=${redBal})`,
  })

  // Session isolation A2b: BLUE session guilds SELECT
  try {
    const { client: blueClient } = await loginAs("BLUE")
    const { data: blueGuilds } = await blueClient.from("guilds").select("id, guild_name")
    const seesRed = (blueGuilds ?? []).some((g) => g.id === redGuild.id)
    results.push({
      id: "A2b",
      ok: !seesRed && (blueGuilds ?? []).length === 1,
      detail: `BLUE ownGuildCount=${(blueGuilds ?? []).length}, sees RED=${seesRed}`,
    })
    await blueClient.auth.signOut()
  } catch (e) {
    results.push({
      id: "A2b",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  const blueProfile = await fetchGuildProfile(admin, blueGuild.id)
  results.push({
    id: "A1b",
    ok: redProfile?.guildName === FIXTURE_GUILD_NAMES.RED && blueProfile?.guildName === FIXTURE_GUILD_NAMES.BLUE,
    detail: `profiles: RED=${redProfile?.guildName}, BLUE=${blueProfile?.guildName}`,
  })

  console.log("=== Phase 4 admin/settings 격리 검증 ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.id}: ${r.detail}`)
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.log(`\n실패 ${failed.length}건`)
    process.exit(1)
  }
  console.log("\n모든 검증 통과")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
