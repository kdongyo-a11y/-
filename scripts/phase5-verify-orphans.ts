/**
 * provisioning orphan read-only 검사
 * 사용: npm run phase5:verify-orphans
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"

loadEnvLocal()

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: orphans, error } = await admin
    .from("guilds")
    .select("id, guild_code, guild_name, status, created_at")
    .eq("status", "provisioning")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("조회 실패:", error.message)
    process.exit(1)
  }

  console.log("=== Phase 5 provisioning orphan 검사 ===\n")
  if (!orphans?.length) {
    console.log("✓ provisioning 상태 guild 없음 (0건)")
    process.exit(0)
  }

  console.log(`✗ provisioning orphan ${orphans.length}건:\n`)
  for (const g of orphans) {
    console.log(`  - ${g.guild_code} (${g.guild_name}) id=${g.id} created=${g.created_at}`)
  }
  process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
