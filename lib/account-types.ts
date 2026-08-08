/** mock 로그인 계정 (Member와 memberId로 연결) */
export type MemberAccount = {
  memberId: string
  passwordHash: string
  isActive: boolean
  isLocked: boolean
  mustChangePassword: boolean
}

/** sessionStorage에 저장하는 최소 세션 정보 (비밀번호 미포함) */
export type StoredAuthSession = {
  memberId: string
  requiresPasswordChange: boolean
}

export const AUTH_SESSION_STORAGE_KEY = "redone-auth-session"
