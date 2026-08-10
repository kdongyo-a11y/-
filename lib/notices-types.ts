export type GuildNotice = {
  id: string
  guildId: string
  title: string
  content: string
  isImportant: boolean
  publishFrom: string
  publishUntil: string | null
  createdByMemberId: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type NoticeDisplayStatus = "published" | "scheduled" | "expired" | "archived"

export type MemberNoticePublic = {
  id: string
  title: string
  content: string
  isImportant: boolean
  publishFrom: string
  publishFromLabel: string
  createdAt: string
  createdAtLabel: string
  authorNickname: string | null
}

export type MemberNoticesListResult = {
  notices: MemberNoticePublic[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

export type AdminNoticeSummary = GuildNotice & {
  displayStatus: NoticeDisplayStatus
  authorNickname: string | null
}

export const HOME_NOTICES_PREVIEW_LIMIT = 3
export const NOTICES_PAGE_SIZE = 20
