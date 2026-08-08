/** SaaS 공용 서비스명 (로그인 전 branding) */
export const SAAS_SERVICE_NAME = "혈맹 운영 관리"

/** 로그인 전/마크 없음 — neutral placeholder (특정 guild asset 사용 금지) */
export const NEUTRAL_GUILD_MARK_PLACEHOLDER: null = null

export const GUILD_ASSETS_BUCKET = "guild-assets"

/** 혈맹마크 업로드 최대 크기 (2MB) */
export const MAX_GUILD_MARK_BYTES = 2 * 1024 * 1024

export const ALLOWED_GUILD_MARK_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const

export type AllowedGuildMarkMimeType = (typeof ALLOWED_GUILD_MARK_MIME_TYPES)[number]

const MIME_TO_EXT: Record<AllowedGuildMarkMimeType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
}

export function guildMarkExtensionForMime(mime: string): string | null {
  if (mime in MIME_TO_EXT) {
    return MIME_TO_EXT[mime as AllowedGuildMarkMimeType]
  }
  return null
}

/** Tenant-isolated storage path: guilds/{guild_id}/marks/{timestamp}.{ext} */
export function buildGuildMarkStoragePath(guildId: string, ext: string): string {
  return `guilds/${guildId}/marks/${Date.now()}.${ext}`
}

export function isGuildMarkPathForGuild(objectPath: string, guildId: string): boolean {
  const prefix = `guilds/${guildId}/`
  return objectPath.startsWith(prefix)
}

/** @deprecated Phase 5.5 — SaaS runtime에서 사용 금지 */
export const DEFAULT_GUILD_NAME = "레드원 혈맹"

/** @deprecated Phase 5.5 — /clan-mark.png fallback 금지 */
export const FALLBACK_GUILD_MARK_PATH = "/clan-mark.png"
