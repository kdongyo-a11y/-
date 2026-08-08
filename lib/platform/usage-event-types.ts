/** Phase 8 — MVP usage event types (server-side only) */
export const USAGE_EVENT_TYPES = [
  "login_success",
  "guild_created",
  "onboarding_completed",
  "member_created",
  "boss_check_started",
  "boss_participation",
  "siege_participation",
  "settlement_created",
  "settlement_completed",
  "dues_created",
  "expense_created",
  "export_completed",
] as const

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number]

export type UsageEventMetadata = Record<string, string | number | boolean | null>

export type RecordUsageEventInput = {
  eventType: UsageEventType
  guildId?: string | null
  memberId?: string | null
  metadata?: UsageEventMetadata | null
}

/** Active guild 판정용 이벤트 (7일/30일) */
export const ACTIVE_GUILD_EVENT_TYPES: UsageEventType[] = [
  "login_success",
  "boss_participation",
  "siege_participation",
  "settlement_created",
  "dues_created",
  "expense_created",
]

/** 기능 사용량 대시보드 표시용 */
export const FEATURE_USAGE_EVENTS: {
  label: string
  eventType: UsageEventType
}[] = [
  { label: "로그인", eventType: "login_success" },
  { label: "보스 참여", eventType: "boss_participation" },
  { label: "공성 참여", eventType: "siege_participation" },
  { label: "정산 생성", eventType: "settlement_created" },
  { label: "정산 완료", eventType: "settlement_completed" },
  { label: "혈비 생성", eventType: "dues_created" },
  { label: "지출 등록", eventType: "expense_created" },
  { label: "XLSX Export", eventType: "export_completed" },
]

const FORBIDDEN_METADATA_KEYS = new Set([
  "password",
  "check_code",
  "checkCode",
  "internal_email",
  "auth_user_id",
  "authUserId",
  "token",
  "ip",
  "email",
  "nickname",
  "characterName",
])

export function sanitizeUsageMetadata(
  metadata?: UsageEventMetadata | null,
): UsageEventMetadata | null {
  if (!metadata || Object.keys(metadata).length === 0) return null

  const clean: UsageEventMetadata = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.has(key)) continue
    if (typeof value === "string" && value.length > 200) continue
    clean[key] = value
  }
  return Object.keys(clean).length > 0 ? clean : null
}
