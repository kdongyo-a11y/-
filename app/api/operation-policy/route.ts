import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { fetchMemberOperationPolicyPublicView } from "@/lib/supabase/operation-settings-data"

/**
 * 운영 정책 조회 — guild-scoped read (member/manager/admin).
 * 수정·취소는 POST /api/admin/operation-settings/mutate (admin only).
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
    const policyView = await fetchMemberOperationPolicyPublicView(
      admin,
      actorGuildId(authResult.member),
    )

    return NextResponse.json({ ok: true, policyView })
  } catch (error) {
    console.error("[operation-policy GET]", error)
    return NextResponse.json(
      { ok: false, message: "운영 정책을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
