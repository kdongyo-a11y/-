/**
 * Phase 5.5+ verify scripts 공용 auth helper — login identity: serverId + guildName
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import { fetchGameServerIdByName } from "../lib/supabase/game-server-data"
import { FIXTURE_GUILD_NAMES, normalizeGuildName } from "../lib/guild-types"
import { FIXTURE_SERVER_NAME } from "../lib/game-server-types"

export { FIXTURE_SERVER_NAME, FIXTURE_GUILD_NAMES }

export async function getFixtureServerId(admin: SupabaseClient): Promise<string> {
  const id = await fetchGameServerIdByName(admin, FIXTURE_SERVER_NAME)
  if (!id) throw new Error(`fixture server '${FIXTURE_SERVER_NAME}' not found — run 012 migration`)
  return id
}

export async function loginAsServerGuild(
  url: string,
  anonKey: string,
  admin: SupabaseClient,
  serverId: string,
  guildName: string,
  nickname: string,
  password: string,
) {
  const normalizedName = normalizeGuildName(guildName)
  const memberRow = await fetchMemberByServerGuildNameAndNickname(
    admin,
    serverId,
    normalizedName,
    nickname,
  )
  if (!memberRow) {
    throw new Error(`${normalizedName}/${nickname} member 없음 (server=${serverId})`)
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: memberRow.internal_email,
    password,
  })
  if (error) throw error
  return { client, memberRow }
}

export type FixtureGuildKey = keyof typeof FIXTURE_GUILD_NAMES

export async function loginFixtureGuild(
  url: string,
  anonKey: string,
  admin: SupabaseClient,
  fixture: FixtureGuildKey,
  nickname: string,
  password: string,
) {
  const serverId = await getFixtureServerId(admin)
  const guildName = FIXTURE_GUILD_NAMES[fixture]
  return loginAsServerGuild(url, anonKey, admin, serverId, guildName, nickname, password)
}

export async function fetchGuildIdByServerAndName(
  admin: SupabaseClient,
  serverId: string,
  guildName: string,
): Promise<string | null> {
  const normalized = normalizeGuildName(guildName)
  const { data } = await admin
    .from("guilds")
    .select("id")
    .eq("server_id", serverId)
    .eq("guild_name", normalized)
    .maybeSingle()
  return data?.id ?? null
}

/** @deprecated 내부 fixture 조회 — guild_code RED/BLUE/GREEN */
export async function fetchGuildIdByServerAndCode(
  admin: SupabaseClient,
  serverId: string,
  guildCode: string,
): Promise<string | null> {
  const { data } = await admin
    .from("guilds")
    .select("id")
    .eq("server_id", serverId)
    .eq("guild_code", guildCode.toUpperCase())
    .maybeSingle()
  return data?.id ?? null
}
