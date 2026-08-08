import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { INITIAL_MEMBER_PASSWORD } from "@/lib/auth-constants"
import {
  actorGuildId,
  requireMemberInActorGuild,
} from "@/lib/supabase/guild-scope-helpers"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    if (authResult.member.role !== "admin") {
      return NextResponse.json(
        { ok: false, message: "비밀번호 초기화는 최고관리자만 가능합니다." },
        { status: 403 },
      )
    }

    const body = (await request.json()) as { memberId?: string }
    const memberId = body.memberId
    if (!memberId) {
      return NextResponse.json(
        { ok: false, message: "대상 혈맹원 ID가 필요합니다." },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    const scopeCheck = await requireMemberInActorGuild(admin, guildId, memberId)
    if (!scopeCheck.ok) {
      return NextResponse.json(
        { ok: false, message: scopeCheck.message },
        { status: scopeCheck.status },
      )
    }

    const { data: target, error: fetchError } = await admin
      .from("members")
      .select("id, auth_user_id, nickname")
      .eq("id", memberId)
      .eq("guild_id", guildId)
      .maybeSingle()

    if (fetchError || !target) {
      return NextResponse.json(
        { ok: false, message: "혈맹원을 찾을 수 없습니다." },
        { status: 404 },
      )
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      target.auth_user_id,
      { password: INITIAL_MEMBER_PASSWORD },
    )
    if (authUpdateError) {
      return NextResponse.json(
        { ok: false, message: "비밀번호 초기화에 실패했습니다." },
        { status: 500 },
      )
    }

    const { error: memberUpdateError } = await admin
      .from("members")
      .update({ must_change_password: true })
      .eq("id", memberId)
      .eq("guild_id", guildId)

    if (memberUpdateError) {
      return NextResponse.json(
        { ok: false, message: "계정 상태 업데이트에 실패했습니다." },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      message: `${target.nickname}님의 비밀번호가 초기화되었습니다. 다음 로그인 시 변경이 필요합니다.`,
    })
  } catch (error) {
    console.error("[members/reset-password]", error)
    return NextResponse.json(
      { ok: false, message: "비밀번호 초기화 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
