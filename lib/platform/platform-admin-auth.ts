import type { SupabaseClient } from "@supabase/supabase-js"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export type PlatformAdminRow = {
  id: string
  auth_user_id: string
  display_name: string
  status: "active" | "inactive"
  created_at: string
}

export type PlatformAdminContext =
  | {
      ok: true
      authUserId: string
      platformAdmin: PlatformAdminRow
    }
  | { ok: false; message: string; status: number }

export async function fetchPlatformAdminByAuthUserId(
  admin: SupabaseClient,
  authUserId: string,
): Promise<PlatformAdminRow | null> {
  const { data, error } = await admin
    .from("platform_admins")
    .select("*")
    .eq("auth_user_id", authUserId)
    .eq("status", "active")
    .maybeSingle()

  if (error || !data) return null
  return data as PlatformAdminRow
}

export async function isPlatformAdminAuthUser(
  admin: SupabaseClient,
  authUserId: string,
): Promise<boolean> {
  const row = await fetchPlatformAdminByAuthUserId(admin, authUserId)
  return row !== null
}

/**
 * session → auth.uid() → platform_admins (status=active)
 * guild member 여부와 무관. query/body로 admin 여부 받지 않음.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, message: "로그인이 필요합니다.", status: 401 }
  }

  const admin = createAdminClient()
  const platformAdmin = await fetchPlatformAdminByAuthUserId(admin, user.id)

  if (!platformAdmin) {
    return { ok: false, message: "플랫폼 운영자 권한이 없습니다.", status: 403 }
  }

  return {
    ok: true,
    authUserId: user.id,
    platformAdmin,
  }
}

/** Route handler용 — Supabase cookie client 전달 시 */
export async function requirePlatformAdminFromClient(
  supabase: SupabaseClient,
): Promise<PlatformAdminContext> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, message: "로그인이 필요합니다.", status: 401 }
  }

  const admin = createAdminClient()
  const platformAdmin = await fetchPlatformAdminByAuthUserId(admin, user.id)

  if (!platformAdmin) {
    return { ok: false, message: "플랫폼 운영자 권한이 없습니다.", status: 403 }
  }

  return {
    ok: true,
    authUserId: user.id,
    platformAdmin,
  }
}
