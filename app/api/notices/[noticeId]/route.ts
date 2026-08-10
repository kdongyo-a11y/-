import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { fetchNoticeByIdForMember } from "@/lib/supabase/notices-data"

type RouteContext = { params: Promise<{ noticeId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const { noticeId } = await context.params
    const admin = createAdminClient()
    const result = await fetchNoticeByIdForMember(
      admin,
      actorGuildId(authResult.member),
      noticeId,
    )

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 404 })
    }

    return NextResponse.json({ ok: true, notice: result.notice })
  } catch (error) {
    console.error("[notices/[noticeId] GET]", error)
    return NextResponse.json(
      { ok: false, message: "공지를 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
