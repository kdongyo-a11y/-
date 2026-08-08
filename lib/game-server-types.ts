export type GameServerStatus = "active" | "inactive"

export type GameServer = {
  id: string
  serverName: string
  status: GameServerStatus
  sortOrder: number
}

export type GameServerRow = {
  id: string
  server_name: string
  status: GameServerStatus
  sort_order: number
  created_at: string
  updated_at: string
}

export type GameServerListItem = {
  id: string
  name: string
}

export function rowToGameServer(row: GameServerRow): GameServer {
  return {
    id: row.id,
    serverName: row.server_name,
    status: row.status,
    sortOrder: row.sort_order,
  }
}

export function toGameServerListItem(row: GameServerRow): GameServerListItem {
  return { id: row.id, name: row.server_name }
}

/** Phase 5.5 테스트 fixture RED/BLUE/GREEN 귀속 서버 */
export const FIXTURE_SERVER_NAME = "데포루쥬"
