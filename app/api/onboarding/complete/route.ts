import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { completeOnboardingOnServer } from "@/lib/supabase/onboarding-data"
import { recordUsageEventFromActor } from "@/lib/platform/usage-events"

export async function POST() {
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
    const result = await completeOnboardingOnServer(admin, actorGuildId(authResult.member))

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 500 })
    }

    void recordUsageEventFromActor("onboarding_completed", authResult.member, null, admin)

    return NextResponse.json({
      ok: true,
      message: "최초 설정이 완료되었습니다.",
      guild: result.guild,
    })
  } catch (error) {
    console.error("[onboarding/complete]", error)
    return NextResponse.json(
      { ok: false, message: "온보딩 완료 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
