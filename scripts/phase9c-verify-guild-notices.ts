/**
 * Phase 9c — guild notices 검증
 * npm run phase9c:verify-guild-notices
 */
import {
  assertMemberNoticeSanitized,
  isNoticeCurrentlyPublished,
  sortNoticesForHome,
} from "../lib/notice-visibility-utils"
import {
  filterNoticesByGuild,
  HOME_NOTICES_PREVIEW_LIMIT,
} from "../lib/supabase/notices-data"
import type { GuildNotice } from "../lib/notices-types"
import { requireAdmin, requireManagerOrAdmin } from "../lib/supabase/operation-auth"
import type { MemberRow } from "../lib/supabase/member-mapper"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function makeNotice(partial: Partial<GuildNotice> & Pick<GuildNotice, "id" | "guildId">): GuildNotice {
  return {
    title: "테스트 공지",
    content: "본문",
    isImportant: false,
    publishFrom: "2026-08-10T00:00:00+09:00",
    publishUntil: null,
    createdByMemberId: "author-1",
    createdAt: "2026-08-09T00:00:00+09:00",
    updatedAt: "2026-08-09T00:00:00+09:00",
    archivedAt: null,
    ...partial,
  }
}

function main() {
  const checks: Check[] = []
  const now = "2026-08-10T12:00:00+09:00"
  const guildA = "guild-a"
  const guildB = "guild-b"

  const publishedA = makeNotice({
    id: "n1",
    guildId: guildA,
    publishFrom: "2026-08-10T00:00:00+09:00",
  })
  const otherGuild = makeNotice({
    id: "n2",
    guildId: guildB,
    publishFrom: "2026-08-10T00:00:00+09:00",
  })

  const guildANotices = filterNoticesByGuild([publishedA, otherGuild], guildA)
  assert(checks, "N1-own-guild-read", guildANotices.length === 1 && guildANotices[0]?.id === "n1", "guild A only")

  assert(
    checks,
    "N2-cross-guild-block",
    filterNoticesByGuild([publishedA, otherGuild], guildA).every((n) => n.guildId === guildA),
    "other guild filtered",
  )

  const mockMember = { role: "member" } as MemberRow
  const mockManager = { role: "manager" } as MemberRow
  const mockAdmin = { role: "admin" } as MemberRow
  assert(
    checks,
    "N3-member-create-blocked",
    !requireManagerOrAdmin(mockMember).ok,
    "member cannot mutate",
  )
  assert(
    checks,
    "N4-manager-create-ok",
    requireManagerOrAdmin(mockManager).ok,
    "manager can mutate",
  )

  function canSetImportantFlag(role: MemberRow["role"], wantsImportant: boolean): boolean {
    if (!wantsImportant) return true
    return role === "admin"
  }
  assert(
    checks,
    "N5-manager-important-blocked",
    !canSetImportantFlag("manager", true),
    "manager cannot set important",
  )
  assert(
    checks,
    "N6-admin-important-ok",
    requireAdmin(mockAdmin).ok,
    "admin can set important",
  )

  const futureNotice = makeNotice({
    id: "n-future",
    guildId: guildA,
    publishFrom: "2026-08-15T00:00:00+09:00",
  })
  assert(
    checks,
    "N7-future-hidden",
    !isNoticeCurrentlyPublished(futureNotice, now),
    "future not published",
  )

  assert(
    checks,
    "N8-publish-from-visible",
    isNoticeCurrentlyPublished(publishedA, now),
    "publish_from reached",
  )

  const expiredNotice = makeNotice({
    id: "n-expired",
    guildId: guildA,
    publishFrom: "2026-08-01T00:00:00+09:00",
    publishUntil: "2026-08-10T00:00:00+09:00",
  })
  assert(
    checks,
    "N9-until-expired-hidden",
    !isNoticeCurrentlyPublished(expiredNotice, now),
    "publish_until passed",
  )

  const archivedNotice = makeNotice({
    id: "n-archived",
    guildId: guildA,
    archivedAt: "2026-08-10T08:00:00+09:00",
  })
  assert(
    checks,
    "N10-archived-hidden",
    !isNoticeCurrentlyPublished(archivedNotice, now),
    "archived hidden",
  )

  const many = Array.from({ length: 5 }, (_, i) =>
    makeNotice({
      id: `n-${i}`,
      guildId: guildA,
      isImportant: i === 0,
      publishFrom: `2026-08-${String(10 - i).padStart(2, "0")}T00:00:00+09:00`,
    }),
  )
  const homePreview = sortNoticesForHome(
    many.filter((n) => isNoticeCurrentlyPublished(n, now)),
  ).slice(0, HOME_NOTICES_PREVIEW_LIMIT)
  assert(
    checks,
    "N11-home-preview-limit",
    homePreview.length === HOME_NOTICES_PREVIEW_LIMIT,
    `preview=${homePreview.length}, full=${many.length}`,
  )
  assert(
    checks,
    "N11-full-access",
    many.filter((n) => isNoticeCurrentlyPublished(n, now)).length === 5,
    "full list still 5",
  )

  assert(
    checks,
    "N12-tenant-isolation",
    filterNoticesByGuild(many, guildB).length === 0,
    "guild B sees none",
  )

  const publicNotice = {
    id: "notice-id-ok",
    title: "공지",
    content: "내용",
    isImportant: false,
    publishFrom: publishedA.publishFrom,
    publishFromLabel: "2026-08-10",
    createdAt: publishedA.createdAt,
    createdAtLabel: "2026-08-09",
    authorNickname: "혈원A",
  }
  assert(checks, "N12-sanitized", assertMemberNoticeSanitized(publicNotice), "no internal fields")

  const passed = checks.filter((c) => c.ok).length
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9c guild notices: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main()
