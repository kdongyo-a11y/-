/** 신규 혈맹원 등록 시 Supabase Auth에 설정하는 초기 비밀번호 (DB에 저장하지 않음) */
export const INITIAL_MEMBER_PASSWORD = "1234"

/** Supabase Auth 내부용 가상 이메일 도메인 (UI에 노출하지 않음) */
export const AUTH_EMAIL_DOMAIN = "redone.local"

export function buildInternalAuthEmail(id: string): string {
  return `${id}@${AUTH_EMAIL_DOMAIN}`
}
