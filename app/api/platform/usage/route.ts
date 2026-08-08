import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePlatformAdmin } from "@/lib/platform/platform-admin-auth"
import { fetchFeatureUsageStats, parsePlatformPeriod } from "@/lib/platform/platform-analytics"

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdmin()
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
    }

    const { searchParams } = new URL(request.url)
    const period = parsePlatformPeriod(searchParams.get("period"))

    const admin = createAdminClient()
    const usage = await fetchFeatureUsageStats(admin, period)

    return NextResponse.json({
      ok: true,
      period,
      usage,
      analyticsSinceNote:
        "기능 사용량은 usage_events migration 015 적용 이후부터 수집됩니다.",
    })
  } catch (error) {
    console.error("[platform/usage GET]", error)
    return NextResponse.json(
      { ok: false, message: "기능 사용량을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
