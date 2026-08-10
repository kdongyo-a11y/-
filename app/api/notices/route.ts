import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  fetchHomeNoticesPreview,
  fetchPublishedNoticesForMember,
  NOTICES_PAGE_SIZE,
} from "@/lib/supabase/notices-data"

/**
 * 혈맹 공지 조회 — guild-scoped read (member/manager/admin).
 * ?preview=1 — 홈 요약 (최대 3건)
 * ?limit=&offset= — 전체 게시 중 공지 pagination
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const url = new URL(request.url)

    if (url.searchParams.get("preview") === "1") {
      const notices = await fetchHomeNoticesPreview(admin, guildId)
      return NextResponse.json({ ok: true, notices })
    }

    const limit = Math.min(
      Math.max(parseInt(url.searchParams.get("limit") ?? String(NOTICES_PAGE_SIZE), 10) || NOTICES_PAGE_SIZE, 1),
      100,
    )
    const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0)

    const result = await fetchPublishedNoticesForMember(admin, guildId, { limit, offset })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error("[notices GET]", error)
    return NextResponse.json(
      { ok: false, message: "공지를 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
