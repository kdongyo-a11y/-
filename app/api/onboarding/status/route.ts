import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { fetchOnboardingStatus } from "@/lib/supabase/onboarding-data"

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

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const admin = createAdminClient()
    const status = await fetchOnboardingStatus(admin, actorGuildId(authResult.member))
    if (!status) {
      return NextResponse.json(
        { ok: false, message: "혈맹 정보를 찾을 수 없습니다." },
        { status: 404 },
      )
    }

    return NextResponse.json({ ok: true, ...status })
  } catch (error) {
    console.error("[onboarding/status]", error)
    return NextResponse.json(
      { ok: false, message: "온보딩 상태 조회 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
