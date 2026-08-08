/**
 * Phase 2 테스트 boss/siege 시드 (RED / BLUE 각 1건)
 * Phase 1 RED/BLUE/군주 계정은 건드리지 않음.
 * 사용: npm run phase2:seed-test-data
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { makeSlotId } from "../lib/boss-time-slots"
import { getFixtureServerId, fetchGuildIdByServerAndCode } from "./test-auth-helpers"

loadEnvLocal()

const TEST_BOSS_DATE = "2026-08-09"
const TEST_BOSS_HOUR = 12
const TEST_SIEGE_DATE = "2026-08-09"

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await assertMigrationApplied(admin)

  const fixtureServerId = await getFixtureServerId(admin)

  const guilds = ["RED", "BLUE"] as const
  console.log("=== Phase 2 테스트 boss/siege 시드 ===\n")

  for (const code of guilds) {
    const guildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, code)
    if (!guildId) {
      console.error(`[FAIL] ${code} guild 없음 — phase1:seed-test-guilds 먼저 실행`)
      process.exit(1)
    }
    const guild = { id: guildId, guild_code: code }

    const slotId = makeSlotId(TEST_BOSS_DATE, TEST_BOSS_HOUR)
    const siegeId = makeSiegeId(TEST_SIEGE_DATE)

    const { data: existingBoss } = await admin
      .from("boss_events")
      .select("id")
      .eq("guild_id", guild.id)
      .eq("event_date", TEST_BOSS_DATE)
      .eq("slot_hour", TEST_BOSS_HOUR)
      .maybeSingle()

    if (existingBoss) {
      console.log(`[SKIP] ${code} boss ${slotId} — 이미 존재`)
    } else {
      const { error: bossError } = await admin.from("boss_events").insert({
        guild_id: guild.id,
        event_date: TEST_BOSS_DATE,
        slot_hour: TEST_BOSS_HOUR,
        slot_type: "general",
        participation_status: "closed",
      })
      if (bossError) {
        console.error(`[FAIL] ${code} boss:`, bossError.message)
        process.exit(1)
      }
      console.log(`[OK] ${code} boss ${slotId}`)
    }

    const { data: existingSiege } = await admin
      .from("siege_events")
      .select("id")
      .eq("guild_id", guild.id)
      .eq("event_date", TEST_SIEGE_DATE)
      .maybeSingle()

    if (existingSiege) {
      console.log(`[SKIP] ${code} siege ${siegeId} — 이미 존재`)
    } else {
      const { error: siegeError } = await admin.from("siege_events").insert({
        guild_id: guild.id,
        event_date: TEST_SIEGE_DATE,
        status: "draft",
        memo: `Phase2 test ${code}`,
      })
      if (siegeError) {
        console.error(`[FAIL] ${code} siege:`, siegeError.message)
        process.exit(1)
      }
      console.log(`[OK] ${code} siege ${siegeId}`)
    }
  }

  console.log("\n완료. 검증: npm run phase2:verify-isolation")
}

async function assertMigrationApplied(
  admin: ReturnType<typeof createClient>,
): Promise<void> {
  const { error } = await admin.from("boss_events").select("guild_id").limit(1)
  if (error?.message?.includes("guild_id") || error?.code === "42703") {
    console.error(
      "008_boss_siege_multitenant_phase2.sql 이 아직 적용되지 않았습니다.\n" +
        "Supabase SQL Editor에서 supabase/migrations/008_boss_siege_multitenant_phase2.sql 을 실행하세요.",
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
