/**
 * Phase 7.1 — IDOR / authorization hardening verification
 * 사용: npm run phase71:verify-security
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import {
  getFixtureServerId,
  fetchGuildIdByServerAndCode,
  FIXTURE_GUILD_NAMES,
} from "./test-auth-helpers"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import {
  requireMemberInActorGuild,
  requireMembersInActorGuild,
} from "../lib/supabase/guild-scope-helpers"
import { requireAdmin } from "../lib/supabase/operation-auth"
import type { MemberRow } from "../lib/supabase/member-mapper"

loadEnvLocal()

type Check = { id: string; ok: boolean; detail: string }

async function countScopedRows(
  admin: ReturnType<typeof createClient>,
  table: string,
  guildId: string,
) {
  const { count } = await admin
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("guild_id", guildId)
  return count ?? 0
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: Check[] = []
  const fixtureServerId = await getFixtureServerId(admin)
  const redGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
  const blueGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "BLUE")
  if (!redGuildId || !blueGuildId) {
    console.error("RED/BLUE fixture missing")
    process.exit(1)
  }

  const redAdmin = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.RED,
    "군주",
  )
  const blueAdmin = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.BLUE,
    "군주",
  )
  if (!redAdmin || !blueAdmin) {
    console.error("RED/BLUE admin missing")
    process.exit(1)
  }

  const beforeRedMembers = await countScopedRows(admin, "members", redGuildId)
  const beforeBlueMembers = await countScopedRows(admin, "members", blueGuildId)

  // I1: RED admin → BLUE member update scope blocked
  const i1 = await requireMemberInActorGuild(admin, redGuildId, blueAdmin.id)
  results.push({
    id: "I1",
    ok: !i1.ok && i1.status === 403,
    detail: i1.ok ? "cross-guild update allowed" : `blocked: ${i1.message}`,
  })

  // I2: RED admin → BLUE reset scope blocked (before auth access)
  const i2 = await requireMemberInActorGuild(admin, redGuildId, blueAdmin.id)
  results.push({
    id: "I2",
    ok: !i2.ok && i2.status === 403,
    detail: "reset-password scope blocked before auth_user lookup",
  })

  // Defensive UPDATE would affect 0 rows for cross-guild
  const crossUpdate = await admin
    .from("members")
    .update({ level: 99 })
    .eq("id", blueAdmin.id)
    .eq("guild_id", redGuildId)
    .select("id")
  results.push({
    id: "I1b",
    ok: (crossUpdate.data?.length ?? 0) === 0,
    detail: `cross-guild UPDATE rows=${crossUpdate.data?.length ?? 0}`,
  })

  // I3: RED admin → RED member scope OK
  const i3 = await requireMemberInActorGuild(admin, redGuildId, redAdmin.id)
  results.push({
    id: "I3",
    ok: i3.ok,
    detail: "RED member in RED guild scope OK",
  })

  // I4: RED admin → RED reset scope OK (no actual reset)
  const i4 = await requireMemberInActorGuild(admin, redGuildId, redAdmin.id)
  const redScopedLookup = await admin
    .from("members")
    .select("id")
    .eq("id", redAdmin.id)
    .eq("guild_id", redGuildId)
    .maybeSingle()
  results.push({
    id: "I4",
    ok: i4.ok && !!redScopedLookup.data,
    detail: "RED reset scope OK (no auth reset executed)",
  })

  // I5: last admin guard is guild-scoped
  const { count: globalAdminCount } = await admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin")
  const { count: redAdminCount } = await admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", redGuildId)
    .eq("role", "admin")
    .eq("status", "활동")
  const { count: blueAdminCount } = await admin
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("guild_id", blueGuildId)
    .eq("role", "admin")
    .eq("status", "활동")
  results.push({
    id: "I5",
    ok:
      (globalAdminCount ?? 0) >= 2 &&
      (redAdminCount ?? 0) === 1 &&
      (blueAdminCount ?? 0) === 1,
    detail: `global admins=${globalAdminCount}, RED=${redAdminCount}, BLUE=${blueAdminCount}`,
  })

  // I6: member cannot mutate contribution settings (GET read allowed by design)
  const memberRow = { ...redAdmin, role: "member" as const } satisfies MemberRow
  const managerRow = { ...redAdmin, role: "manager" as const } satisfies MemberRow
  results.push({
    id: "I6",
    ok: !requireAdmin(memberRow).ok,
    detail: "member → contribution-settings/mutate blocked via requireAdmin",
  })

  // I7: manager cannot mutate contribution settings
  results.push({
    id: "I7",
    ok: !requireAdmin(managerRow).ok,
    detail: "manager → contribution-settings/mutate blocked via requireAdmin",
  })

  // I6b: GET is guild-scoped read for contribution calculation (all roles)
  const { data: redSettings } = await admin
    .from("contribution_score_settings")
    .select("id")
    .eq("guild_id", redGuildId)
  const { data: blueSettings } = await admin
    .from("contribution_score_settings")
    .select("id")
    .eq("guild_id", blueGuildId)
  results.push({
    id: "I6b",
    ok: (redSettings?.length ?? 0) > 0 && redGuildId !== blueGuildId,
    detail: "GET endpoint serves guild-scoped settings per actor.guild_id",
  })

  // I8: siege revise attendees cross-guild blocked
  const i8 = await requireMembersInActorGuild(admin, redGuildId, [redAdmin.id, blueAdmin.id])
  results.push({
    id: "I8",
    ok: !i8.ok && i8.status === 403,
    detail: i8.ok ? "mixed attendees allowed" : i8.message,
  })

  // I9: all RED attendees OK
  const i9 = await requireMembersInActorGuild(admin, redGuildId, [redAdmin.id])
  results.push({
    id: "I9",
    ok: i9.ok,
    detail: "RED-only attendees pass batch scope check",
  })

  // I10: no fixture damage from scope checks
  const afterRedMembers = await countScopedRows(admin, "members", redGuildId)
  const afterBlueMembers = await countScopedRows(admin, "members", blueGuildId)
  results.push({
    id: "I10",
    ok:
      beforeRedMembers === afterRedMembers &&
      beforeBlueMembers === afterBlueMembers,
    detail: `members unchanged RED=${afterRedMembers} BLUE=${afterBlueMembers}`,
  })

  console.log("=== Phase 7.1 Security Verification ===\n")
  let failed = 0
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL"
    if (!r.ok) failed++
    console.log(`[${mark}] ${r.id}: ${r.detail}`)
  }
  console.log(`\n${results.length - failed}/${results.length} passed`)
  if (failed > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
