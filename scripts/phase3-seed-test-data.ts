/**
 * Phase 3 테스트 finance/settlement 시드 (선택적 보조)
 * Phase 1/2 RED/BLUE 데이터 재사용. 기존 계정 삭제/재생성 없음.
 * 사용: npm run phase3:seed-test-data
 */
import { createClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { makeSlotId } from "../lib/boss-time-slots"
import { makeSiegeId } from "../lib/siege-utils"

loadEnvLocal()

const TEST_MONTH = "2026-09"
const TEST_BOSS_DATE = "2026-08-09"
const TEST_BOSS_HOUR = 12

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await assertMigrationApplied(admin)

  console.log("=== Phase 3 테스트 finance 시드 (보조) ===\n")
  console.log("정산/혈비/지출/장부 격리 검증은 phase3:verify-isolation 에서 수행합니다.")
  console.log(`테스트 slotId: ${makeSlotId(TEST_BOSS_DATE, TEST_BOSS_HOUR)}`)
  console.log(`테스트 siegeId: ${makeSiegeId(TEST_BOSS_DATE)}`)
  console.log(`테스트 dues month: ${TEST_MONTH}`)
  console.log("\n완료. 검증: npm run phase3:verify-isolation")
}

async function assertMigrationApplied(
  admin: ReturnType<typeof createClient>,
): Promise<void> {
  const { error } = await admin.from("settlements").select("guild_id").limit(1)
  if (error?.message?.includes("guild_id") || error?.code === "42703") {
    console.error(
      "009_finance_settlement_multitenant_phase3.sql 미적용.\n" +
        "Supabase SQL Editor에서 migration 009를 실행하세요.",
    )
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
