/**
 * Phase 1 테스트 guild 시드: RED / BLUE (012 migration fixture guild_name)
 * 사용: npm run phase1:seed-test-guilds
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { createGuildOnboarding } from "../lib/supabase/guild-onboarding-saga"
import { FIXTURE_GUILD_NAMES } from "../lib/guild-types"
import { fetchGuildIdByServerAndCode, getFixtureServerId } from "./test-auth-helpers"

loadEnvLocal()

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const serverId = await getFixtureServerId(admin)

  const targets = [
    { code: "RED" as const, guildName: FIXTURE_GUILD_NAMES.RED, adminNickname: "군주" },
    { code: "BLUE" as const, guildName: FIXTURE_GUILD_NAMES.BLUE, adminNickname: "군주" },
  ]

  console.log("=== Phase 1 테스트 guild 시드 ===\n")

  for (const target of targets) {
    const existingId = await fetchGuildIdByServerAndCode(admin, serverId, target.code)
    if (existingId) {
      console.log(`[SKIP] ${target.code} (${target.guildName}) — 이미 존재`)
      continue
    }

    const result = await createGuildOnboarding(admin, {
      serverId,
      guildName: target.guildName,
      adminNickname: target.adminNickname,
      password: TEST_PASSWORD.length >= 8 ? TEST_PASSWORD : "test12345",
    })

    if (!result.ok) {
      console.error(`[FAIL] ${target.guildName}: ${result.message}`)
      process.exit(1)
    }

    console.log(
      `[OK] ${target.guildName} — guild=${result.guild.id}, admin=${result.adminMember.nickname}`,
    )
  }

  console.log("\n완료. 로그인 테스트: npm run phase1:verify-isolation")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
