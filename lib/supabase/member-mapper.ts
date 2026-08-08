import type {
  Member,
  MemberAccountStatus,
  MemberCharacterClass,
  MemberPosition,
  MemberProgramRole,
  MemberStatus,
} from "@/lib/member-types"

export type MemberRow = {
  id: string
  guild_id: string
  auth_user_id: string
  internal_email: string
  nickname: string
  class_name: MemberCharacterClass
  level: number
  position: MemberPosition
  join_date: string
  status: MemberStatus
  role: MemberProgramRole
  account_status: MemberAccountStatus
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export function rowToMember(row: MemberRow): Member {
  return {
    id: row.id,
    guildId: row.guild_id,
    nickname: row.nickname,
    characterClass: row.class_name,
    level: Number(row.level) || 0,
    position: row.position,
    joinDate: String(row.join_date).slice(0, 10),
    status: row.status,
    role: row.role,
    accountStatus: row.account_status,
    mustChangePassword: row.must_change_password,
  }
}

export function memberToRowUpdate(
  input: Partial<
    Pick<
      Member,
      "characterClass" | "level" | "position" | "joinDate" | "status" | "role"
    >
  >,
): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.characterClass !== undefined) patch.class_name = input.characterClass
  if (input.level !== undefined) patch.level = input.level
  if (input.position !== undefined) patch.position = input.position
  if (input.joinDate !== undefined) patch.join_date = input.joinDate
  if (input.status !== undefined) patch.status = input.status
  if (input.role !== undefined) patch.role = input.role
  return patch
}
