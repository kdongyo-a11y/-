import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import {
  createMemberOnServer,
  validateCreateMemberInput,
  type CreateMemberInput,
} from "@/lib/supabase/member-create-core"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITIONS,
  type MemberCharacterClass,
  type MemberPosition,
} from "@/lib/member-types"

type BulkMemberRow = {
  nickname?: string
  characterClass?: MemberCharacterClass
  level?: number
  position?: MemberPosition
  joinDate?: string
}

type BulkCreateBody = {
  members?: BulkMemberRow[]
}

type ValidationError = { row: number; nickname: string; message: string }

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

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const body = (await request.json()) as BulkCreateBody
    const rows = body.members ?? []
    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: "등록할 혈맹원이 없습니다." }, { status: 400 })
    }

    const validationErrors: ValidationError[] = []
    const nicknamesInBatch = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const nickname = row.nickname?.trim() ?? ""
      const rowNum = i + 1

      if (!nickname) {
        validationErrors.push({ row: rowNum, nickname: "", message: "캐릭터명을 입력해주세요." })
        continue
      }
      if (nicknamesInBatch.has(nickname)) {
        validationErrors.push({ row: rowNum, nickname, message: "목록 내 중복 캐릭터명입니다." })
        continue
      }
      nicknamesInBatch.add(nickname)

      if (!row.characterClass || !MEMBER_CHARACTER_CLASSES.includes(row.characterClass)) {
        validationErrors.push({ row: rowNum, nickname, message: "클래스가 올바르지 않습니다." })
        continue
      }
      if (!row.position || !MEMBER_POSITIONS.includes(row.position)) {
        validationErrors.push({ row: rowNum, nickname, message: "직책이 올바르지 않습니다." })
        continue
      }

      const input: CreateMemberInput = {
        nickname,
        characterClass: row.characterClass,
        level: Number(row.level),
        position: row.position,
        joinDate: row.joinDate,
      }
      const validation = validateCreateMemberInput(input)
      if (!validation.ok) {
        validationErrors.push({ row: rowNum, nickname, message: validation.message })
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "입력값 검증에 실패했습니다.",
          validationErrors,
        },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const actor = authResult.member
    const guildId = actor.guild_id

    const { data: existingMembers } = await admin
      .from("members")
      .select("nickname")
      .eq("guild_id", guildId)
    const existingNicknames = new Set((existingMembers ?? []).map((m: { nickname: string }) => m.nickname))

    const dbErrors: ValidationError[] = []
    for (let i = 0; i < rows.length; i++) {
      const nickname = rows[i].nickname!.trim()
      if (existingNicknames.has(nickname)) {
        dbErrors.push({ row: i + 1, nickname, message: "이미 등록된 캐릭터명입니다." })
      }
    }

    if (dbErrors.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          message: "DB에 이미 존재하는 캐릭터명이 있습니다.",
          validationErrors: dbErrors,
        },
        { status: 409 },
      )
    }

    const successes: { row: number; nickname: string; memberId: string }[] = []
    const failures: ValidationError[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const input: CreateMemberInput = {
        nickname: row.nickname!.trim(),
        characterClass: row.characterClass!,
        level: Number(row.level),
        position: row.position!,
        joinDate: row.joinDate,
      }

      const result = await createMemberOnServer(admin, guildId, input)
      if (result.ok) {
        successes.push({ row: i + 1, nickname: input.nickname, memberId: result.member.id })
      } else {
        failures.push({ row: i + 1, nickname: input.nickname, message: result.message })
      }
    }

    return NextResponse.json({
      ok: failures.length === 0,
      message:
        failures.length === 0
          ? `${successes.length}명 일괄 등록이 완료되었습니다.`
          : `성공 ${successes.length}명, 실패 ${failures.length}명`,
      successCount: successes.length,
      failureCount: failures.length,
      successes,
      failures,
    })
  } catch (error) {
    console.error("[members/bulk-create]", error)
    return NextResponse.json(
      { ok: false, message: "일괄 등록 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
