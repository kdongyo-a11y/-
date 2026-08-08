/**
 * SaaS Supabase row inventory (read-only)
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { FIXTURE_GUILD_NAMES } from "../lib/guild-types"
import { fetchGuildIdByServerAndCode, getFixtureServerId } from "./test-auth-helpers"

loadEnvLocal()

async function countTable(
  admin: ReturnType<typeof createClient>,
  table: string,
  filter?: { col: string; val: string },
) {
  let q = admin.from(table).select("*", { count: "exact", head: true })
  if (filter) q = q.eq(filter.col, filter.val)
  const { count, error } = await q
  return error ? `ERR:${error.message}` : String(count ?? 0)
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const serverId = await getFixtureServerId(admin)
  const redId = await fetchGuildIdByServerAndCode(admin, serverId, "RED")
  const blueId = await fetchGuildIdByServerAndCode(admin, serverId, "BLUE")
  const greenId = await fetchGuildIdByServerAndCode(admin, serverId, "GREEN")

  const { count: serverCount } = await admin
    .from("game_servers")
    .select("*", { count: "exact", head: true })

  const { data: guilds } = await admin
    .from("guilds")
    .select("id, guild_name, guild_code, server_id, status, onboarding_completed")
    .order("created_at")

  const { count: exportLogCount } = await admin
    .from("guild_export_logs")
    .select("*", { count: "exact", head: true })

  console.log("=== SaaS DB Inventory (read-only) ===\n")
  console.log(`game_servers: ${serverCount ?? 0}`)
  console.log(`guilds total: ${guilds?.length ?? 0}`)
  console.log(`guild_export_logs: ${exportLogCount ?? "N/A (table missing)"}`)
  console.log(`fixture server_id: ${serverId}`)
  console.log(`RED guild_id: ${redId ?? "—"}`)
  console.log(`BLUE guild_id: ${blueId ?? "—"}`)
  console.log(`GREEN guild_id: ${greenId ?? "—"}`)

  console.log("\n--- guilds ---")
  for (const g of guilds ?? []) {
    const { data: srv } = await admin
      .from("game_servers")
      .select("server_name")
      .eq("id", g.server_id)
      .maybeSingle()
    const { count: memberCount } = await admin
      .from("members")
      .select("*", { count: "exact", head: true })
      .eq("guild_id", g.id)
    console.log(
      `  ${srv?.server_name ?? "?"} / ${g.guild_name} (${g.guild_code}) status=${g.status} onboarding=${g.onboarding_completed} members=${memberCount ?? 0}`,
    )
  }

  const tables = [
    "members",
    "boss_events",
    "boss_participations",
    "siege_events",
    "siege_participations",
    "settlements",
    "settlement_members",
    "dues",
    "due_members",
    "expenses",
    "ledger_entries",
    "contribution_score_settings",
    "guild_finance_settings",
    "guild_export_logs",
  ] as const

  console.log("\n--- table row counts (global) ---")
  for (const t of tables) {
    console.log(`  ${t}: ${await countTable(admin, t)}`)
  }

  if (redId && blueId) {
    console.log("\n--- RED vs BLUE scoped counts ---")
    for (const t of ["boss_events", "siege_events", "settlements", "ledger_entries", "guild_export_logs"] as const) {
      const r = await countTable(admin, t, { col: "guild_id", val: redId })
      const b = await countTable(admin, t, { col: "guild_id", val: blueId })
      console.log(`  ${t}: RED=${r} BLUE=${b}`)
    }
  }

  // Phase55 cross-server same guild_name fixtures
  const { data: redwonGuilds } = await admin
    .from("guilds")
    .select("id, guild_name, server_id")
    .eq("guild_name", "레드원")

  if (redwonGuilds && redwonGuilds.length > 0) {
    console.log("\n--- same guild_name '레드원' across servers ---")
    for (const g of redwonGuilds) {
      const { data: srv } = await admin
        .from("game_servers")
        .select("server_name")
        .eq("id", g.server_id)
        .maybeSingle()
      console.log(`  ${srv?.server_name ?? "?"} → guild_id=${g.id}`)
    }
  }

  console.log(`\nfixture guild_names: ${FIXTURE_GUILD_NAMES.RED}, ${FIXTURE_GUILD_NAMES.BLUE}, ${FIXTURE_GUILD_NAMES.GREEN}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
