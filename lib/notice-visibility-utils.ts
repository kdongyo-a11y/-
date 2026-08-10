import type { GuildNotice, NoticeDisplayStatus } from "@/lib/notices-types"

/** 현재 게시 중: publish_from <= now AND (publish_until IS NULL OR > now) AND archived_at IS NULL */
export function isNoticeCurrentlyPublished(
  notice: Pick<GuildNotice, "publishFrom" | "publishUntil" | "archivedAt">,
  nowIso = new Date().toISOString(),
): boolean {
  if (notice.archivedAt) return false
  const nowMs = new Date(nowIso).getTime()
  if (new Date(notice.publishFrom).getTime() > nowMs) return false
  if (notice.publishUntil && new Date(notice.publishUntil).getTime() <= nowMs) return false
  return true
}

export function getNoticeDisplayStatus(
  notice: Pick<GuildNotice, "publishFrom" | "publishUntil" | "archivedAt">,
  nowIso = new Date().toISOString(),
): NoticeDisplayStatus {
  if (notice.archivedAt) return "archived"
  const nowMs = new Date(nowIso).getTime()
  if (new Date(notice.publishFrom).getTime() > nowMs) return "scheduled"
  if (notice.publishUntil && new Date(notice.publishUntil).getTime() <= nowMs) return "expired"
  return "published"
}

/** 홈 요약: 중요공지 우선 → publish_from DESC */
export function sortNoticesForHome<T extends Pick<GuildNotice, "isImportant" | "publishFrom">>(
  notices: T[],
): T[] {
  return [...notices].sort((a, b) => {
    if (a.isImportant !== b.isImportant) return a.isImportant ? -1 : 1
    return new Date(b.publishFrom).getTime() - new Date(a.publishFrom).getTime()
  })
}

/** 전체 목록: publish_from DESC */
export function sortNoticesForList<T extends Pick<GuildNotice, "publishFrom">>(
  notices: T[],
): T[] {
  return [...notices].sort(
    (a, b) => new Date(b.publishFrom).getTime() - new Date(a.publishFrom).getTime(),
  )
}

export function truncateNoticeContent(content: string, maxLen = 80): string {
  const trimmed = content.trim()
  if (trimmed.length <= maxLen) return trimmed
  return `${trimmed.slice(0, maxLen)}…`
}

/** 공개 view에 작성자 UUID 등 내부 필드 없는지 검증 (테스트용) */
export function assertMemberNoticeSanitized(notice: Record<string, unknown>): boolean {
  const json = JSON.stringify(notice)
  const forbidden = [
    "createdByMemberId",
    "created_by_member_id",
    "guildId",
    "guild_id",
    "auth_user_id",
    "archivedAt",
    "archived_at",
  ]
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  if (forbidden.some((k) => json.includes(`"${k}"`))) return false
  // notice id UUID는 허용 (상세 링크용)
  const withoutId = json.replace(/"id":"[^"]+"/, "")
  return !uuidPattern.test(withoutId)
}
