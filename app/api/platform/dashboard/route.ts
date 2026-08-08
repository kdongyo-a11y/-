import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requirePlatformAdmin } from "@/lib/platform/platform-admin-auth"
import { buildPlatformDashboard, parsePlatformPeriod } from "@/lib/platform/platform-analytics"

export async function GET(request: Request) {
  try {
    const ctx = await requirePlatformAdmin()
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
    }

    const { searchParams } = new URL(request.url)
    const period = parsePlatformPeriod(searchParams.get("period"))

    const admin = createAdminClient()
    const dashboard = await buildPlatformDashboard(admin, period)

    return NextResponse.json({
      ok: true,
      platformAdmin: { displayName: ctx.platformAdmin.display_name },
      dashboard,
    })
  } catch (error) {
    console.error("[platform/dashboard GET]", error)
    return NextResponse.json(
      { ok: false, message: "플랫폼 대시보드를 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
