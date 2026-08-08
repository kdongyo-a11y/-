import type { MemberAccount } from "@/lib/account-types"
import { hashPassword } from "@/lib/auth-utils"

/** 신규 혈맹원 등록 시 고정 초기 비밀번호 */
export const INITIAL_MEMBER_PASSWORD = "1234"

/** 프로토타입 테스트용 계정 — 비밀번호는 문서/주석으로만 안내 */
function account(
  memberId: string,
  plainPassword: string,
  opts: Partial<Pick<MemberAccount, "isActive" | "isLocked" | "mustChangePassword">> = {},
): MemberAccount {
  return {
    memberId,
    passwordHash: hashPassword(plainPassword),
    isActive: opts.isActive ?? true,
    isLocked: opts.isLocked ?? false,
    mustChangePassword: opts.mustChangePassword ?? false,
  }
}

/** 관리자 혈맹원 등록 시 생성하는 로그인 계정 */
export function buildNewMemberAccount(memberId: string): MemberAccount {
  return account(memberId, INITIAL_MEMBER_PASSWORD, { mustChangePassword: true })
}

export const INITIAL_ACCOUNTS: MemberAccount[] = [
  // 최고관리자 — 활성, 비밀번호 변경 완료
  account("u-101", "Admin2026!"),
  // 일반 혈원 — 초기 비밀번호 1234, 최초 로그인 시 변경
  account("u-102", INITIAL_MEMBER_PASSWORD, { mustChangePassword: true }),
  // 운영 관리자
  account("u-103", "Manager2026!"),
  // 일반 혈원 (비밀번호 변경 완료)
  account("u-105", "Member2026!"),
  // 미활성 계정 테스트
  account("u-104", "Inactive1!", { isActive: false }),
  // 잠금 계정 테스트
  account("u-106", "Locked123!", { isLocked: true }),
  // 휴면 혈맹원 (u-258)
  account("u-258", "Dormant1!"),
  // 탈퇴 혈맹원 (u-260)
  account("u-260", "Withdraw1!"),
]

/** 테스트용 계정 안내 (개발 문서용) */
export const MOCK_TEST_CREDENTIALS = [
  { nickname: "관리자킹", password: "Admin2026!", note: "최고관리자 (admin)" },
  { nickname: "홍길동", password: INITIAL_MEMBER_PASSWORD, note: "일반 혈원 — 최초 로그인 시 비밀번호 변경" },
  { nickname: "달빛기사", password: "Manager2026!", note: "운영 관리자 (manager)" },
  { nickname: "붉은장미", password: "Member2026!", note: "일반 혈원 (manager 직책, member role)" },
  { nickname: "그림자", password: "Inactive1!", note: "미활성 계정 테스트" },
  { nickname: "천둥", password: "Locked123!", note: "잠금 계정 테스트" },
] as const
