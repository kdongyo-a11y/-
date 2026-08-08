import { INITIAL_MEMBER_PASSWORD } from "@/lib/auth-constants"

const MOCK_SALT = "redone-clan-mock-v1"

/** 프로토타입용 mock 해시 — Supabase Auth 연동 전 */
export function hashPassword(password: string): string {
  let h = 0
  const s = `${password}:${MOCK_SALT}`
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return `mock:${h.toString(36)}:${password.length}`
}

export function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash
}

export function isValidNewPassword(password: string): boolean {
  return password.length >= 8
}

export type PasswordChangeValidation = { ok: true } | { ok: false; message: string }

/** 최초 변경·본인 변경 공통 새 비밀번호 규칙 검증 */
export function validatePasswordChange(input: {
  newPassword: string
  confirmPassword: string
  currentPassword?: string
}): PasswordChangeValidation {
  const { newPassword, confirmPassword, currentPassword } = input

  if (currentPassword !== undefined && !currentPassword) {
    return { ok: false, message: "현재 비밀번호를 입력해주세요." }
  }
  if (!newPassword || !confirmPassword) {
    return { ok: false, message: "새 비밀번호를 입력해주세요." }
  }
  if (newPassword === INITIAL_MEMBER_PASSWORD) {
    return {
      ok: false,
      message: "초기 비밀번호(1234)는 사용할 수 없습니다. 다른 비밀번호를 설정해주세요.",
    }
  }
  if (!isValidNewPassword(newPassword)) {
    return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." }
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, message: "비밀번호 확인이 일치하지 않습니다." }
  }
  if (currentPassword !== undefined && newPassword === currentPassword) {
    return {
      ok: false,
      message: "현재 비밀번호와 다른 비밀번호를 사용해주세요.",
    }
  }
  return { ok: true }
}
