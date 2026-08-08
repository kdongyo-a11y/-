import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { createMemberOnServer, validateCreateMemberInput } from "@/lib/supabase/member-create-core"
import {
  MEMBER_CHARACTER_CLASSES,
  type MemberCharacterClass,
  type MemberPosition,
  type MemberProgramRole,
  type MemberStatus,
} from "@/lib/member-types"
import { recordUsageEventFromActor } from "@/lib/platform/usage-events"

type CreateBody = {
  nickname?: string
  characterClass?: MemberCharacterClass
  level?: number
  position?: MemberPosition
  joinDate?: string
  status?: MemberStatus
  role?: MemberProgramRole
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

    const actor = authResult.member
    if (actor.role !== "manager" && actor.role !== "admin") {
      return NextResponse.json(
        { ok: false, message: "혈맹원 등록 권한이 없습니다." },
        { status: 403 },
      )
    }

    const body = (await request.json()) as CreateBody
    const role = body.role ?? "member"

    if (role !== "member" && actor.role !== "admin") {
      return NextResponse.json(
        { ok: false, message: "프로그램 권한은 최고관리자만 설정할 수 있습니다." },
        { status: 403 },
      )
    }

    const input = {
      nickname: body.nickname ?? "",
      characterClass: body.characterClass as MemberCharacterClass,
      level: body.level ?? 0,
      position: body.position as MemberPosition,
      joinDate: body.joinDate,
      status: body.status,
      role,
    }

    const validation = validateCreateMemberInput(input)
    if (!validation.ok) {
      return NextResponse.json({ ok: false, message: validation.message }, { status: 400 })
    }
    if (!input.characterClass || !MEMBER_CHARACTER_CLASSES.includes(input.characterClass)) {
      return NextResponse.json({ ok: false, message: "클래스를 선택해주세요." }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await createMemberOnServer(admin, actor.guild_id, input)

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
    }

    void recordUsageEventFromActor("member_created", actor, null, admin)

    return NextResponse.json({
      ok: true,
      message: "혈맹원이 등록되었습니다.",
      member: result.member,
    })
  } catch (error) {
    console.error("[members/create]", error)
    return NextResponse.json(
      { ok: false, message: "혈맹원 등록 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
