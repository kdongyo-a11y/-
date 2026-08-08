/**
 * Platform admin 수동 bootstrap
 *
 * 사용:
 *   npx tsx scripts/bootstrap-platform-admin.ts <auth_user_id> [display_name]
 *
 * 또는 Supabase SQL Editor:
 *   INSERT INTO platform_admins (auth_user_id, display_name, status)
 *   VALUES ('<auth.users.id>', '운영자 이름', 'active');
 *
 * 주의: 앱 UI에서 platform admin 생성 기능 없음. public signup 승격 금지.
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"

loadEnvLocal()

async function main() {
  const authUserId = process.argv[2]?.trim()
  const displayName = process.argv[3]?.trim() || "Platform Operator"

  if (!authUserId) {
    console.error("Usage: npx tsx scripts/bootstrap-platform-admin.ts <auth_user_id> [display_name]")
    console.error("\nauth_user_id는 Supabase Dashboard → Authentication → Users 에서 확인")
    process.exit(1)
  }

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: authUser, error: authError } = await admin.auth.admin.getUserById(authUserId)
  if (authError || !authUser.user) {
    console.error("Auth user not found:", authUserId)
    process.exit(1)
  }

  const { data: existing } = await admin
    .from("platform_admins")
    .select("id, status")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (existing) {
    const { error } = await admin
      .from("platform_admins")
      .update({ display_name: displayName, status: "active" })
      .eq("auth_user_id", authUserId)

    if (error) {
      console.error("Update failed:", error.message)
      process.exit(1)
    }
    console.log(`Updated platform admin: ${displayName} (${authUserId})`)
    return
  }

  const { error } = await admin.from("platform_admins").insert({
    auth_user_id: authUserId,
    display_name: displayName,
    status: "active",
  })

  if (error) {
    if (error.code === "42P01") {
      console.error("platform_admins table missing — apply 015_platform_usage_analytics.sql first")
    } else {
      console.error("Insert failed:", error.message)
    }
    process.exit(1)
  }

  console.log(`Created platform admin: ${displayName} (${authUserId})`)
  console.log("\n접속: 로그인 후 /platform")
  console.log("platform admin은 guild member일 필요 없으나, 세션을 위해 Supabase Auth 계정이 필요합니다.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
