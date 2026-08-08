/**
 * Phase 1 테넌트 격리 검증:
 * - RED/군주, BLUE/군주 로그인 성공 (데포루쥬 서버)
 * - RED 세션은 BLUE members 조회 불가 (RLS)
 * 사용: npm run phase1:verify-isolation
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { loginFixtureGuild, getFixtureServerId } from "./test-auth-helpers"

loadEnvLocal()

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"

type CheckResult = { name: string; ok: boolean; detail: string }

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: CheckResult[] = []
  const fixtureServerId = await getFixtureServerId(admin)
  results.push({ name: "fixture server", ok: true, detail: fixtureServerId })

  // RED login
  try {
    const { client: redClient, memberRow: redMember } = await loginFixtureGuild(
      url,
      anonKey,
      admin,
      "RED",
      "군주",
      TEST_PASSWORD,
    )
    results.push({ name: "RED/군주 로그인", ok: true, detail: `memberId=${redMember.id}` })

    const { data: redMembers, error: redSelectError } = await redClient
      .from("members")
      .select("id, nickname, guild_id")

    if (redSelectError) throw redSelectError

    const allSameGuild = (redMembers ?? []).every((m) => m.guild_id === redMember.guild_id)
    const hasForeign = (redMembers ?? []).some((m) => m.guild_id !== redMember.guild_id)

    results.push({
      name: "RED 세션 members SELECT",
      ok: allSameGuild && !hasForeign,
      detail: `count=${redMembers?.length ?? 0}, guild_id=${redMember.guild_id}`,
    })

    const { data: blueGuild } = await admin
      .from("guilds")
      .select("id")
      .eq("server_id", fixtureServerId)
      .eq("guild_code", "BLUE")
      .maybeSingle()

    if (blueGuild) {
      const leakedBlue = (redMembers ?? []).filter((m) => m.guild_id === blueGuild.id)
      results.push({
        name: "RED → BLUE members 노출 차단",
        ok: leakedBlue.length === 0,
        detail: leakedBlue.length === 0 ? "격리 OK" : `유출 ${leakedBlue.length}건`,
      })
    }

    await redClient.auth.signOut()
  } catch (e) {
    results.push({
      name: "RED/군주 로그인",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // BLUE login
  try {
    const { client: blueClient, memberRow: blueMember } = await loginFixtureGuild(
      url,
      anonKey,
      admin,
      "BLUE",
      "군주",
      TEST_PASSWORD,
    )
    results.push({ name: "BLUE/군주 로그인", ok: true, detail: `memberId=${blueMember.id}` })

    const { data: blueMembers } = await blueClient.from("members").select("guild_id")
    const { data: redGuild } = await admin
      .from("guilds")
      .select("id")
      .eq("server_id", fixtureServerId)
      .eq("guild_code", "RED")
      .maybeSingle()

    const leakedRed = redGuild
      ? (blueMembers ?? []).filter((m) => m.guild_id === redGuild.id)
      : []

    results.push({
      name: "BLUE → RED members 노출 차단",
      ok: leakedRed.length === 0,
      detail: `count=${blueMembers?.length ?? 0}`,
    })

    await blueClient.auth.signOut()
  } catch (e) {
    results.push({
      name: "BLUE/군주 로그인",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  console.log("\n=== Phase 1 테넌트 격리 검증 ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`)
  }
  const failed = results.filter((r) => !r.ok)
  console.log(failed.length === 0 ? "\n모든 검증 통과" : `\nFAILED: ${failed.map((f) => f.name).join(", ")}`)
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
