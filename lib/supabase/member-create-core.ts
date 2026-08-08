import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildInternalAuthEmail, INITIAL_MEMBER_PASSWORD } from "@/lib/auth-constants"
import { rowToMember, type MemberRow } from "@/lib/supabase/member-mapper"
import { isValidMemberLevel } from "@/lib/member-utils"
import {
  MEMBER_CHARACTER_CLASSES,
  type MemberCharacterClass,
  type MemberPosition,
  type MemberProgramRole,
  type MemberStatus,
} from "@/lib/member-types"

export type CreateMemberInput = {
  nickname: string
  characterClass: MemberCharacterClass
  level: number
  position: MemberPosition
  joinDate?: string
  status?: MemberStatus
  role?: MemberProgramRole
  /** 미지정 시 INITIAL_MEMBER_PASSWORD 사용 */
  password?: string
  /** 미지정 시 true (운영 최고관리자 등 예외 계정용) */
  mustChangePassword?: boolean
}

export type CreateMemberResult =
  | { ok: true; member: ReturnType<typeof rowToMember> }
  | { ok: false; message: string; status: number }

export function validateCreateMemberInput(input: CreateMemberInput): { ok: true } | { ok: false; message: string } {
  const nickname = input.nickname.trim()
  if (!nickname) return { ok: false, message: "캐릭터명을 입력해주세요." }
  if (!input.characterClass || !MEMBER_CHARACTER_CLASSES.includes(input.characterClass)) {
    return { ok: false, message: "클래스를 선택해주세요." }
  }
  if (input.level === undefined || !isValidMemberLevel(input.level)) {
    return { ok: false, message: "레벨은 1~999 사이 정수여야 합니다." }
  }
  if (!input.position) return { ok: false, message: "직책을 선택해주세요." }
  if (input.joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.joinDate)) {
    return { ok: false, message: "가입일 형식이 올바르지 않습니다. (YYYY-MM-DD)" }
  }
  return { ok: true }
}

export async function createMemberOnServer(
  admin: SupabaseClient,
  guildId: string,
  input: CreateMemberInput,
): Promise<CreateMemberResult> {
  const validation = validateCreateMemberInput(input)
  if (!validation.ok) return { ok: false, message: validation.message, status: 400 }

  const nickname = input.nickname.trim()
  const role = input.role ?? "member"
  const password = input.password ?? INITIAL_MEMBER_PASSWORD
  const mustChangePassword = input.mustChangePassword ?? true

  const { data: existing } = await admin
    .from("members")
    .select("id")
    .eq("guild_id", guildId)
    .eq("nickname", nickname)
    .maybeSingle()

  if (existing) {
    return { ok: false, message: "이미 등록된 혈맹원입니다.", status: 409 }
  }

  const memberId = randomUUID()
  const internalEmail = buildInternalAuthEmail(memberId)
  let authUserId: string | null = null

  try {
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      throw authError ?? new Error("Auth 계정 생성 실패")
    }

    authUserId = authData.user.id

    const { data: memberRow, error: memberError } = await admin
      .from("members")
      .insert({
        id: memberId,
        guild_id: guildId,
        auth_user_id: authUserId,
        internal_email: internalEmail,
        nickname,
        class_name: input.characterClass,
        level: input.level,
        position: input.position,
        join_date: input.joinDate ?? new Date().toISOString().slice(0, 10),
        status: input.status ?? "활동",
        role,
        account_status: "active",
        must_change_password: mustChangePassword,
      })
      .select("*")
      .single()

    if (memberError || !memberRow) {
      throw memberError ?? new Error("members 레코드 생성 실패")
    }

    return { ok: true, member: rowToMember(memberRow as MemberRow) }
  } catch (createError) {
    if (authUserId) {
      await admin.auth.admin.deleteUser(authUserId).catch(() => {})
    }
    console.error("[createMemberOnServer]", createError)
    return { ok: false, message: "혈맹원 등록 중 오류가 발생했습니다.", status: 500 }
  }
}
