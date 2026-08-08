import type { MemberRow } from "@/lib/supabase/member-mapper"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITIONS,
  MEMBER_PROGRAM_ROLES,
  MEMBER_STATUSES,
  type MemberAccountStatus,
  type MemberCharacterClass,
  type MemberPosition,
  type MemberProgramRole,
  type MemberStatus,
} from "@/lib/member-types"
import { isValidMemberLevel } from "@/lib/member-utils"

export type AdminMemberUpdateInput = {
  characterClass?: MemberCharacterClass
  level?: number
  position?: MemberPosition
  joinDate?: string
  status?: MemberStatus
  role?: MemberProgramRole
  accountStatus?: MemberAccountStatus
}

const MANAGER_ALLOWED: (keyof AdminMemberUpdateInput)[] = [
  "characterClass",
  "level",
  "position",
  "joinDate",
  "status",
]

const ADMIN_ONLY: (keyof AdminMemberUpdateInput)[] = ["role", "accountStatus"]

function isValidPosition(value: string): value is MemberPosition {
  return (MEMBER_POSITIONS as readonly string[]).includes(value)
}

function isValidStatus(value: string): value is MemberStatus {
  return (MEMBER_STATUSES as readonly string[]).includes(value)
}

function isValidRole(value: string): value is MemberProgramRole {
  return (MEMBER_PROGRAM_ROLES as readonly string[]).includes(value)
}

function isValidAccountStatus(value: string): value is MemberAccountStatus {
  return value === "inactive" || value === "active" || value === "locked"
}

export function buildAuthorizedMemberPatch(
  actor: MemberRow,
  input: AdminMemberUpdateInput,
): { ok: true; patch: Record<string, unknown> } | { ok: false; message: string } {
  if (actor.role === "member") {
    return { ok: false, message: "혈맹원 정보 수정 권한이 없습니다." }
  }

  const patch: Record<string, unknown> = {}
  const entries = Object.entries(input) as [keyof AdminMemberUpdateInput, unknown][]

  for (const [key, value] of entries) {
    if (value === undefined) continue

    if (ADMIN_ONLY.includes(key)) {
      if (actor.role !== "admin") {
        return { ok: false, message: "해당 필드는 최고관리자만 수정할 수 있습니다." }
      }
    } else if (!MANAGER_ALLOWED.includes(key)) {
      return { ok: false, message: "수정할 수 없는 필드입니다." }
    }

    switch (key) {
      case "characterClass":
        if (!MEMBER_CHARACTER_CLASSES.includes(value as MemberCharacterClass)) {
          return { ok: false, message: "올바른 클래스를 선택해주세요." }
        }
        patch.class_name = value
        break
      case "level":
        if (!isValidMemberLevel(value as number)) {
          return { ok: false, message: "레벨은 1~999 사이 정수여야 합니다." }
        }
        patch.level = value
        break
      case "position":
        if (!isValidPosition(value as string)) {
          return { ok: false, message: "올바른 직책을 선택해주세요." }
        }
        patch.position = value
        break
      case "joinDate":
        patch.join_date = value
        break
      case "status":
        if (!isValidStatus(value as string)) {
          return { ok: false, message: "올바른 상태를 선택해주세요." }
        }
        patch.status = value
        break
      case "role":
        if (!isValidRole(value as string)) {
          return { ok: false, message: "올바른 권한을 선택해주세요." }
        }
        patch.role = value
        break
      case "accountStatus":
        if (!isValidAccountStatus(value as string)) {
          return { ok: false, message: "올바른 계정 상태를 선택해주세요." }
        }
        patch.account_status = value
        break
    }
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, message: "변경할 항목이 없습니다." }
  }

  patch.updated_at = new Date().toISOString()
  return { ok: true, patch }
}
