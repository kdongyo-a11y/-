import type { SupabaseClient } from "@supabase/supabase-js"
import { normalizeGuildCode, rowToGuild, type GuildRow } from "@/lib/guild-types"

export async function fetchGuildById(
  supabase: SupabaseClient,
  guildId: string,
): Promise<ReturnType<typeof rowToGuild> | null> {
  const { data, error } = await supabase
    .from("guilds")
    .select("*")
    .eq("id", guildId)
    .maybeSingle()

  if (error || !data) return null
  return rowToGuild(data as GuildRow)
}

export async function fetchGuildByServerAndCode(
  supabase: SupabaseClient,
  serverId: string,
  guildCode: string,
): Promise<ReturnType<typeof rowToGuild> | null> {
  const { data, error } = await supabase
    .from("guilds")
    .select("*")
    .eq("server_id", serverId)
    .eq("guild_code", normalizeGuildCode(guildCode))
    .maybeSingle()

  if (error || !data) return null
  return rowToGuild(data as GuildRow)
}

/** @deprecated Phase 5.5 — serverId + guildName 사용 */
export async function fetchGuildByCode(
  supabase: SupabaseClient,
  guildCode: string,
): Promise<ReturnType<typeof rowToGuild> | null> {
  const { data, error } = await supabase
    .from("guilds")
    .select("*")
    .eq("guild_code", normalizeGuildCode(guildCode))
    .maybeSingle()

  if (error || !data) return null
  return rowToGuild(data as GuildRow)
}
