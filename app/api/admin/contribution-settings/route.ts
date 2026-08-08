import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { fetchContributionScoreSettings } from "@/lib/supabase/admin-settings-data"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

/**
 * 기여도 점수 설정 조회 — guild-scoped read.
 * ContributionSettingsProvider가 member/manager/admin 모두에게
 * 기여도 계산용 effective score를 제공하므로 requireAdmin 미적용.
 * 설정 변경은 POST /mutate (requireAdmin) 전용.
 */
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

    const admin = createAdminClient()
    const settings = await fetchContributionScoreSettings(admin, actorGuildId(authResult.member))

    return NextResponse.json({ ok: true, settings })
  } catch (error) {
    console.error("[admin/contribution-settings GET]", error)
    return NextResponse.json(
      { ok: false, message: "기여도 점수 설정을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
