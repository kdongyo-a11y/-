import type { PostgrestError } from "@supabase/supabase-js"

export function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as PostgrestError).message === "string"
  )
}

export function errorToMessage(error: unknown, fallback: string): string {
  if (isPostgrestError(error)) return formatDbError(error, fallback)
  if (error instanceof Error && error.message) {
    return process.env.NODE_ENV === "development"
      ? `${fallback} (${error.message})`
      : fallback
  }
  return fallback
}

export function formatDbError(
  error: PostgrestError | null | undefined,
  fallback: string,
): string {
  if (!error) return fallback

  const code = error.code ?? ""
  const message = error.message ?? ""
  const details = error.details ?? ""
  const combined = `${message} ${details}`.toLowerCase()

  if (
    code === "42P01" ||
    code === "PGRST205" ||
    combined.includes("does not exist") ||
    combined.includes("could not find the table")
  ) {
    if (combined.includes("boss_events")) {
      return "boss_events 테이블이 없습니다. Supabase Dashboard → SQL Editor에서 supabase/migrations/002_participation.sql 전체를 실행해 주세요."
    }
    return "필요한 DB 테이블이 없습니다. Supabase SQL Editor에서 migration SQL(002_participation.sql)을 실행해 주세요."
  }

  if (code === "42501" || combined.includes("permission denied")) {
    return "DB 쓰기 권한이 없습니다. .env.local 의 SUPABASE_SERVICE_ROLE_KEY가 Service Role 키인지 확인하고, supabase/migrations/002_fix_service_role_grants.sql 을 실행해 보세요."
  }

  if (code === "42883" && combined.includes("set_updated_at")) {
    return "set_updated_at 함수가 없습니다. Supabase SQL Editor에서 001_members.sql 을 먼저 실행한 뒤 002_participation.sql 을 실행해 주세요."
  }

  if (code === "23505") {
    return "이미 등록된 타임입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."
  }

  if (code === "PGRST201" && combined.includes("more than one relationship")) {
    return "데이터 조회 설정 오류입니다. 앱을 최신 버전으로 배포한 뒤 다시 시도해 주세요."
  }

  if (process.env.NODE_ENV === "development") {
    const hint = [code, message, details].filter(Boolean).join(" — ")
    return hint ? `${fallback} (${hint})` : fallback
  }

  return `${fallback} Supabase migration(002_participation.sql) 적용 및 Service Role 키 설정을 확인해 주세요.`
}
