import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePlatformAdmin } from "@/lib/platform/platform-admin-auth"
import { fetchGuildUsageTable, parsePlatformPeriod } from "@/lib/platform/platform-analytics"

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdmin()
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
    }

    const { searchParams } = new URL(request.url)
    parsePlatformPeriod(searchParams.get("period"))

    const admin = createAdminClient()
    const guilds = await fetchGuildUsageTable(admin)

    return NextResponse.json({
      ok: true,
      guilds,
      analyticsSinceNote:
        "혈맹별 사용 현황은 usage_events migration 적용 이후부터 집계됩니다.",
    })
  } catch (error) {
    console.error("[platform/guilds GET]", error)
    return NextResponse.json(
      { ok: false, message: "혈맹 사용 현황을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
