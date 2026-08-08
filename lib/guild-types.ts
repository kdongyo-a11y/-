import { randomUUID } from "crypto"

export type GuildStatus = "provisioning" | "active" | "suspended" | "archived"

export type Guild = {
  id: string
  serverId: string
  guildName: string
  guildCode: string
  guildMarkPath: string | null
  status: GuildStatus
  onboardingCompleted: boolean
}

export type GuildRow = {
  id: string
  server_id: string
  guild_name: string
  guild_code: string
  guild_mark_path: string | null
  status: GuildStatus
  onboarding_completed?: boolean
  onboarding_completed_at?: string | null
  created_at: string
  updated_at: string
}

export function rowToGuild(row: GuildRow): Guild {
  return {
    id: row.id,
    serverId: row.server_id,
    guildName: row.guild_name,
    guildCode: row.guild_code,
    guildMarkPath: row.guild_mark_path,
    status: row.status,
    onboardingCompleted: row.onboarding_completed ?? false,
  }
}

/** 로그인/생성 identity — trim + 연속 공백 1칸, 대소문자/문자 치환 없음 */
export function normalizeGuildName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ")
}

const GUILD_NAME_MIN = 2
const GUILD_NAME_MAX = 32

/** 한글·영문·숫자·공백 허용 (2~32자) */
export function isValidGuildName(name: string): boolean {
  const normalized = normalizeGuildName(name)
  if (normalized.length < GUILD_NAME_MIN || normalized.length > GUILD_NAME_MAX) return false
  return /^[\p{L}\p{N}\s]+$/u.test(normalized)
}

/** 내부 guild_code 자동 생성 — 로그인/UI 미사용 */
export function generateInternalGuildCode(): string {
  return `G${randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`
}

/** @deprecated 내부 코드 전용 */
export function normalizeGuildCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/** SaaS 테스트 fixture guild_name (012 migration과 동기) */
export const FIXTURE_GUILD_NAMES = {
  RED: "레드",
  BLUE: "블루",
  GREEN: "그린",
} as const
