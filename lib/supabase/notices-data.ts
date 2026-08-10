import type { SupabaseClient } from "@supabase/supabase-js"
import { formatKstDateTimeLabel } from "@/lib/operation-policy-kst-utils"
import {
  getNoticeDisplayStatus,
  isNoticeCurrentlyPublished,
  sortNoticesForHome,
  sortNoticesForList,
} from "@/lib/notice-visibility-utils"
import type {
  AdminNoticeSummary,
  GuildNotice,
  MemberNoticePublic,
  MemberNoticesListResult,
} from "@/lib/notices-types"
import { HOME_NOTICES_PREVIEW_LIMIT, NOTICES_PAGE_SIZE } from "@/lib/notices-types"

type NoticeRow = {
  id: string
  guild_id: string
  title: string
  content: string
  is_important: boolean
  publish_from: string
  publish_until: string | null
  created_by_member_id: string | null
  created_at: string
  updated_at: string
  archived_at: string | null
}

function mapNoticeRow(row: NoticeRow): GuildNotice {
  return {
    id: row.id,
    guildId: row.guild_id,
    title: row.title,
    content: row.content,
    isImportant: row.is_important,
    publishFrom: row.publish_from,
    publishUntil: row.publish_until,
    createdByMemberId: row.created_by_member_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  }
}

async function fetchAuthorNicknames(
  admin: SupabaseClient,
  guildId: string,
  memberIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(memberIds.filter(Boolean))]
  if (unique.length === 0) return new Map()

  const { data } = await admin
    .from("members")
    .select("id, nickname")
    .eq("guild_id", guildId)
    .in("id", unique)

  return new Map((data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]))
}

function toMemberPublic(
  notice: GuildNotice,
  authorNickname: string | null,
): MemberNoticePublic {
  return {
    id: notice.id,
    title: notice.title,
    content: notice.content,
    isImportant: notice.isImportant,
    publishFrom: notice.publishFrom,
    publishFromLabel: formatKstDateTimeLabel(notice.publishFrom),
    createdAt: notice.createdAt,
    createdAtLabel: formatKstDateTimeLabel(notice.createdAt),
    authorNickname,
  }
}

export async function fetchGuildNotices(
  admin: SupabaseClient,
  guildId: string,
): Promise<GuildNotice[]> {
  const { data, error } = await admin
    .from("guild_notices")
    .select("*")
    .eq("guild_id", guildId)
    .order("publish_from", { ascending: false })

  if (error) {
    console.error("[fetchGuildNotices]", error)
    return []
  }

  return ((data ?? []) as NoticeRow[]).map(mapNoticeRow)
}

export async function fetchPublishedNoticesForMember(
  admin: SupabaseClient,
  guildId: string,
  options: { limit: number; offset: number; nowIso?: string },
): Promise<MemberNoticesListResult> {
  const nowIso = options.nowIso ?? new Date().toISOString()
  const all = await fetchGuildNotices(admin, guildId)
  const published = sortNoticesForList(
    all.filter((n) => isNoticeCurrentlyPublished(n, nowIso)),
  )

  const slice = published.slice(options.offset, options.offset + options.limit)
  const authorIds = slice.map((n) => n.createdByMemberId).filter((id): id is string => !!id)
  const names = await fetchAuthorNicknames(admin, guildId, authorIds)

  return {
    notices: slice.map((n) =>
      toMemberPublic(n, n.createdByMemberId ? (names.get(n.createdByMemberId) ?? null) : null),
    ),
    total: published.length,
    limit: options.limit,
    offset: options.offset,
    hasMore: options.offset + options.limit < published.length,
  }
}

export async function fetchHomeNoticesPreview(
  admin: SupabaseClient,
  guildId: string,
  nowIso = new Date().toISOString(),
): Promise<MemberNoticePublic[]> {
  const all = await fetchGuildNotices(admin, guildId)
  const published = sortNoticesForHome(
    all.filter((n) => isNoticeCurrentlyPublished(n, nowIso)),
  ).slice(0, HOME_NOTICES_PREVIEW_LIMIT)

  const authorIds = published.map((n) => n.createdByMemberId).filter((id): id is string => !!id)
  const names = await fetchAuthorNicknames(admin, guildId, authorIds)

  return published.map((n) =>
    toMemberPublic(n, n.createdByMemberId ? (names.get(n.createdByMemberId) ?? null) : null),
  )
}

export async function fetchNoticeByIdForMember(
  admin: SupabaseClient,
  guildId: string,
  noticeId: string,
  nowIso = new Date().toISOString(),
): Promise<{ ok: true; notice: MemberNoticePublic } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("guild_notices")
    .select("*")
    .eq("id", noticeId)
    .eq("guild_id", guildId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: "공지를 찾을 수 없습니다." }
  }

  const notice = mapNoticeRow(data as NoticeRow)
  if (!isNoticeCurrentlyPublished(notice, nowIso)) {
    return { ok: false, message: "현재 게시 중인 공지가 아닙니다." }
  }

  const names = await fetchAuthorNicknames(
    admin,
    guildId,
    notice.createdByMemberId ? [notice.createdByMemberId] : [],
  )
  const authorNickname = notice.createdByMemberId
    ? (names.get(notice.createdByMemberId) ?? null)
    : null

  return { ok: true, notice: toMemberPublic(notice, authorNickname) }
}

export async function fetchAdminNoticesView(
  admin: SupabaseClient,
  guildId: string,
  nowIso = new Date().toISOString(),
): Promise<AdminNoticeSummary[]> {
  const all = await fetchGuildNotices(admin, guildId)
  const authorIds = all.map((n) => n.createdByMemberId).filter((id): id is string => !!id)
  const names = await fetchAuthorNicknames(admin, guildId, authorIds)

  return all.map((n) => ({
    ...n,
    displayStatus: getNoticeDisplayStatus(n, nowIso),
    authorNickname: n.createdByMemberId ? (names.get(n.createdByMemberId) ?? null) : null,
  }))
}

export async function requireNoticeInActorGuild(
  admin: SupabaseClient,
  guildId: string,
  noticeId: string,
): Promise<{ ok: true; notice: GuildNotice } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("guild_notices")
    .select("*")
    .eq("id", noticeId)
    .eq("guild_id", guildId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: "공지를 찾을 수 없습니다." }
  }

  return { ok: true, notice: mapNoticeRow(data as NoticeRow) }
}

export async function createGuildNoticeOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  input: {
    title: string
    content: string
    isImportant: boolean
    publishFromIso: string
    publishUntilIso: string | null
  },
): Promise<{ ok: true; notice: GuildNotice } | { ok: false; message: string }> {
  if (!input.title.trim()) {
    return { ok: false, message: "제목을 입력해주세요." }
  }
  if (!input.content.trim()) {
    return { ok: false, message: "본문을 입력해주세요." }
  }
  if (
    input.publishUntilIso &&
    new Date(input.publishUntilIso).getTime() <= new Date(input.publishFromIso).getTime()
  ) {
    return { ok: false, message: "게시 종료 시각은 시작 시각 이후여야 합니다." }
  }

  const { data, error } = await admin
    .from("guild_notices")
    .insert({
      guild_id: guildId,
      title: input.title.trim(),
      content: input.content.trim(),
      is_important: input.isImportant,
      publish_from: input.publishFromIso,
      publish_until: input.publishUntilIso,
      created_by_member_id: actorId,
    })
    .select("*")
    .single()

  if (error || !data) {
    console.error("[createGuildNoticeOnServer]", error)
    return { ok: false, message: "공지 저장에 실패했습니다." }
  }

  return { ok: true, notice: mapNoticeRow(data as NoticeRow) }
}

export async function updateGuildNoticeOnServer(
  admin: SupabaseClient,
  guildId: string,
  noticeId: string,
  input: {
    title: string
    content: string
    isImportant: boolean
    publishFromIso: string
    publishUntilIso: string | null
  },
): Promise<{ ok: true; notice: GuildNotice } | { ok: false; message: string }> {
  const existing = await requireNoticeInActorGuild(admin, guildId, noticeId)
  if (!existing.ok) return existing

  if (existing.notice.archivedAt) {
    return { ok: false, message: "보관된 공지는 수정할 수 없습니다." }
  }

  if (!input.title.trim() || !input.content.trim()) {
    return { ok: false, message: "제목과 본문을 입력해주세요." }
  }

  if (
    input.publishUntilIso &&
    new Date(input.publishUntilIso).getTime() <= new Date(input.publishFromIso).getTime()
  ) {
    return { ok: false, message: "게시 종료 시각은 시작 시각 이후여야 합니다." }
  }

  const { data, error } = await admin
    .from("guild_notices")
    .update({
      title: input.title.trim(),
      content: input.content.trim(),
      is_important: input.isImportant,
      publish_from: input.publishFromIso,
      publish_until: input.publishUntilIso,
      updated_at: new Date().toISOString(),
    })
    .eq("id", noticeId)
    .eq("guild_id", guildId)
    .select("*")
    .single()

  if (error || !data) {
    console.error("[updateGuildNoticeOnServer]", error)
    return { ok: false, message: "공지 수정에 실패했습니다." }
  }

  return { ok: true, notice: mapNoticeRow(data as NoticeRow) }
}

export async function archiveGuildNoticeOnServer(
  admin: SupabaseClient,
  guildId: string,
  noticeId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const existing = await requireNoticeInActorGuild(admin, guildId, noticeId)
  if (!existing.ok) return existing

  if (existing.notice.archivedAt) {
    return { ok: false, message: "이미 보관된 공지입니다." }
  }

  const { error } = await admin
    .from("guild_notices")
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", noticeId)
    .eq("guild_id", guildId)

  if (error) {
    console.error("[archiveGuildNoticeOnServer]", error)
    return { ok: false, message: "공지 보관에 실패했습니다." }
  }

  return { ok: true }
}

/** tenant isolation helper — 다른 guild row 접근 차단 검증용 */
export function filterNoticesByGuild(notices: GuildNotice[], guildId: string): GuildNotice[] {
  return notices.filter((n) => n.guildId === guildId)
}

export { HOME_NOTICES_PREVIEW_LIMIT, NOTICES_PAGE_SIZE }
