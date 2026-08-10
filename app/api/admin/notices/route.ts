import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { fetchAdminNoticesView } from "@/lib/supabase/notices-data"

/** manager/admin — 예약·보관 포함 전체 공지 목록 */
export async function GET() {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const admin = createAdminClient()
    const notices = await fetchAdminNoticesView(admin, actorGuildId(authResult.member))

    return NextResponse.json({
      ok: true,
      notices,
      canSetImportant: authResult.member.role === "admin",
    })
  } catch (error) {
    console.error("[admin/notices GET]", error)
    return NextResponse.json(
      { ok: false, message: "공지 목록을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
