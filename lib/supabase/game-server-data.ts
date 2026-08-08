import type { SupabaseClient } from "@supabase/supabase-js"
import {
  rowToGameServer,
  toGameServerListItem,
  type GameServer,
  type GameServerListItem,
  type GameServerRow,
} from "@/lib/game-server-types"

export async function fetchActiveGameServers(
  client: SupabaseClient,
): Promise<GameServerListItem[]> {
  const result = await fetchActiveGameServersWithStatus(client)
  return result.ok ? result.servers : []
}

export type FetchGameServersResult =
  | { ok: true; servers: GameServerListItem[] }
  | {
      ok: false
      reason: "table_missing" | "query_error" | "empty"
      message: string
    }

function isMissingGameServersTable(error: { code?: string; message?: string }): boolean {
  const msg = error.message ?? ""
  return (
    error.code === "PGRST205" ||
    msg.includes("game_servers") ||
    msg.includes("Could not find the table")
  )
}

/** public API — 빈 배열/스키마 오류를 구분 */
export async function fetchActiveGameServersWithStatus(
  client: SupabaseClient,
): Promise<FetchGameServersResult> {
  const { data, error } = await client
    .from("game_servers")
    .select("id, server_name, status, sort_order")
    .eq("status", "active")
    .order("sort_order", { ascending: true })

  if (error) {
    console.error("[fetchActiveGameServersWithStatus]", error)
    if (isMissingGameServersTable(error)) {
      return {
        ok: false,
        reason: "table_missing",
        message: "서버 목록을 불러오지 못했습니다.",
      }
    }
    return {
      ok: false,
      reason: "query_error",
      message: "서버 목록을 불러오지 못했습니다.",
    }
  }

  if (!data || data.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "서버 목록을 불러오지 못했습니다.",
    }
  }

  return {
    ok: true,
    servers: (data as GameServerRow[]).map(toGameServerListItem),
  }
}

export async function fetchGameServerById(
  client: SupabaseClient,
  serverId: string,
): Promise<GameServer | null> {
  const { data, error } = await client
    .from("game_servers")
    .select("*")
    .eq("id", serverId)
    .maybeSingle()

  if (error || !data) return null
  return rowToGameServer(data as GameServerRow)
}

export async function isActiveGameServer(
  client: SupabaseClient,
  serverId: string,
): Promise<boolean> {
  const server = await fetchGameServerById(client, serverId)
  return server?.status === "active"
}

export async function fetchGameServerIdByName(
  client: SupabaseClient,
  serverName: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("game_servers")
    .select("id")
    .eq("server_name", serverName)
    .maybeSingle()

  if (error || !data) return null
  return data.id as string
}
