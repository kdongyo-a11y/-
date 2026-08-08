export type MemberPosition = "군주" | "부군주" | "운영진" | "일반"
export type MemberStatus = "활동" | "휴면" | "탈퇴"
export type MemberProgramRole = "member" | "manager" | "admin"
export type MemberAccountStatus = "inactive" | "active" | "locked"

/** 인게임 클래스 (4종) */
export type MemberCharacterClass = "군주" | "기사" | "마법사" | "요정"

export type Member = {
  id: string
  /** 테넌트(혈맹) ID — session member에서만 신뢰 */
  guildId: string
  /** 캐릭터명 — guild 내 UNIQUE, 전역 UNIQUE 아님 */
  nickname: string
  characterClass: MemberCharacterClass
  level: number
  position: MemberPosition
  joinDate: string
  status: MemberStatus
  role: MemberProgramRole
  /** Supabase members.account_status (인증·로그인 제어) */
  accountStatus?: MemberAccountStatus
  /** true면 최초 로그인 비밀번호 변경 필수 */
  mustChangePassword?: boolean
}

export type AdminChangeLog = {
  id: string
  type:
    | "member_status"
    | "member_role"
    | "member_update"
    | "member_nickname_correction"
    | "dues_payment"
    | "expense_update"
    | "expense_cancel"
  targetId: string
  oldValue: string
  newValue: string
  memo: string
  changedAt: number
}

export const MEMBER_CHARACTER_CLASSES: MemberCharacterClass[] = [
  "군주",
  "기사",
  "마법사",
  "요정",
]

export const MEMBER_POSITION_LABELS: Record<MemberPosition, string> = {
  군주: "군주",
  부군주: "부군주",
  운영진: "운영진",
  일반: "일반",
}

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  활동: "활동",
  휴면: "휴면",
  탈퇴: "탈퇴",
}

export const MEMBER_ROLE_LABELS: Record<MemberProgramRole, string> = {
  member: "혈원",
  manager: "관리자",
  admin: "최고관리자",
}

export const MEMBER_POSITIONS: MemberPosition[] = ["군주", "부군주", "운영진", "일반"]
export const MEMBER_STATUSES: MemberStatus[] = ["활동", "휴면", "탈퇴"]
export const MEMBER_PROGRAM_ROLES: MemberProgramRole[] = ["member", "manager", "admin"]

export const MEMBER_ACCOUNT_STATUSES: MemberAccountStatus[] = ["active", "locked", "inactive"]

export const MEMBER_ACCOUNT_STATUS_LABELS: Record<MemberAccountStatus, string> = {
  active: "활성",
  locked: "잠금",
  inactive: "미활성",
}

/** 참여/정산 roster용 최소 타입 */
export type RosterMember = Pick<Member, "id" | "nickname">
