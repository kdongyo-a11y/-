import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import {
  buildAuthorizedMemberPatch,
  type AdminMemberUpdateInput,
} from "@/lib/supabase/member-update-auth"
import { rowToMember } from "@/lib/supabase/member-mapper"
import {
  actorGuildId,
  requireMemberInActorGuild,
} from "@/lib/supabase/guild-scope-helpers"

type UpdateBody = AdminMemberUpdateInput & {
  memberId?: string
}

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

    const body = (await request.json()) as UpdateBody
    const memberId = body.memberId
    if (!memberId) {
      return NextResponse.json(
        { ok: false, message: "대상 혈맹원 ID가 필요합니다." },
        { status: 400 },
      )
    }

    const patchResult = buildAuthorizedMemberPatch(authResult.member, body)
    if (!patchResult.ok) {
      return NextResponse.json(
        { ok: false, message: patchResult.message },
        { status: authResult.member.role === "member" ? 403 : 400 },
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

    const { data: targetMember, error: fetchError } = await admin
      .from("members")
      .select("id, role")
      .eq("id", memberId)
      .eq("guild_id", guildId)
      .maybeSingle()

    if (fetchError || !targetMember) {
      return NextResponse.json(
        { ok: false, message: "혈맹원을 찾을 수 없습니다." },
        { status: 404 },
      )
    }

    if (
      body.role !== undefined &&
      body.role !== "admin" &&
      targetMember.role === "admin"
    ) {
      const { count } = await admin
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("guild_id", guildId)
        .eq("role", "admin")
        .eq("status", "활동")

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "최고관리자가 한 명뿐입니다. 다른 혈맹원에게 최고관리자 권한을 부여한 뒤 변경해주세요.",
          },
          { status: 409 },
        )
      }
    }

    const { data: updated, error: updateError } = await admin
      .from("members")
      .update(patchResult.patch)
      .eq("id", memberId)
      .eq("guild_id", guildId)
      .select("*")
      .single()

    if (updateError || !updated) {
      console.error("[members/update]", updateError)
      return NextResponse.json(
        { ok: false, message: "저장에 실패했습니다." },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      message: "혈맹원 정보가 수정되었습니다.",
      member: rowToMember(updated),
    })
  } catch (error) {
    console.error("[members/update]", error)
    return NextResponse.json(
      { ok: false, message: "혈맹원 정보 수정 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
