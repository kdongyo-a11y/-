import type { SupabaseClient } from "@supabase/supabase-js"
import {
  GUILD_ASSETS_BUCKET,
  isGuildMarkPathForGuild,
} from "@/lib/guild-profile-constants"

export type GuildProfile = {
  guildName: string
  serverId: string
  serverName: string
  guildMarkPath: string | null
  guildMarkUrl: string | null
  updatedAt: string | null
}

export type GuildProfileState = {
  guildName: string
  serverId: string
  serverName: string
  guildMarkUrl: string | null
  guildMarkPath: string | null
  updatedAt: string | null
}

export function toGuildProfileState(profile: GuildProfile): GuildProfileState {
  return {
    guildName: profile.guildName,
    serverId: profile.serverId,
    serverName: profile.serverName,
    guildMarkUrl: profile.guildMarkUrl,
    guildMarkPath: profile.guildMarkPath,
    updatedAt: profile.updatedAt,
  }
}

function getSupabasePublicUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) return ""
  return url.replace(/\/$/, "")
}

export function resolveGuildMarkPublicUrl(
  guildMarkPath: string | null,
  supabaseUrl = getSupabasePublicUrl(),
): string | null {
  if (!guildMarkPath) return null
  if (guildMarkPath.startsWith("http://") || guildMarkPath.startsWith("https://")) {
    return guildMarkPath
  }
  if (!supabaseUrl) return null
  return `${supabaseUrl}/storage/v1/object/public/${GUILD_ASSETS_BUCKET}/${guildMarkPath}`
}

function mapGuildRow(row: {
  guild_name: string
  guild_mark_path: string | null
  updated_at: string
  server_id: string
  game_servers: { server_name: string } | { server_name: string }[] | null
}): GuildProfile {
  const serverRow = Array.isArray(row.game_servers)
    ? row.game_servers[0]
    : row.game_servers

  return {
    guildName: row.guild_name,
    serverId: row.server_id,
    serverName: serverRow?.server_name ?? "",
    guildMarkPath: row.guild_mark_path,
    guildMarkUrl: resolveGuildMarkPublicUrl(row.guild_mark_path),
    updatedAt: row.updated_at,
  }
}

export async function fetchGuildProfile(
  admin: SupabaseClient,
  guildId: string,
): Promise<GuildProfile | null> {
  const { data, error } = await admin
    .from("guilds")
    .select("guild_name, guild_mark_path, updated_at, server_id, game_servers(server_name)")
    .eq("id", guildId)
    .maybeSingle()

  if (error) {
    console.error("[fetchGuildProfile]", error)
    return null
  }

  if (!data) return null

  return mapGuildRow(data as Parameters<typeof mapGuildRow>[0])
}

export async function updateGuildMarkPathOnServer(
  admin: SupabaseClient,
  guildId: string,
  guildMarkPath: string,
): Promise<{ ok: true; profile: GuildProfile } | { ok: false; message: string }> {
  if (!isGuildMarkPathForGuild(guildMarkPath, guildId)) {
    return { ok: false, message: "혈맹마크 경로가 올바르지 않습니다." }
  }

  const { data, error } = await admin
    .from("guilds")
    .update({
      guild_mark_path: guildMarkPath,
      updated_at: new Date().toISOString(),
    })
    .eq("id", guildId)
    .select("guild_name, guild_mark_path, updated_at, server_id, game_servers(server_name)")
    .single()

  if (error || !data) {
    console.error("[updateGuildMarkPathOnServer]", error)
    return { ok: false, message: "혈맹마크 저장에 실패했습니다." }
  }

  return { ok: true, profile: mapGuildRow(data as Parameters<typeof mapGuildRow>[0]) }
}

export async function removeGuildMarkObject(
  admin: SupabaseClient,
  guildId: string,
  objectPath: string,
): Promise<void> {
  if (!objectPath || objectPath.startsWith("http")) return
  if (!isGuildMarkPathForGuild(objectPath, guildId)) {
    console.warn("[removeGuildMarkObject] cross-guild path blocked:", objectPath)
    return
  }
  const { error } = await admin.storage.from(GUILD_ASSETS_BUCKET).remove([objectPath])
  if (error) {
    console.warn("[removeGuildMarkObject]", objectPath, error.message)
  }
}
