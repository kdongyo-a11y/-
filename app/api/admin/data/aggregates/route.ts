import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdminDataContext } from "@/lib/admin-data/admin-data-auth"
import { resolveAdminPeriod, type PeriodType } from "@/lib/admin-data/period-utils"
import { fetchGuildScopedSnapshot } from "@/lib/admin-data/guild-scoped-data"
import { buildAdminAggregates } from "@/lib/admin-data/admin-analytics"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const ctx = await requireAdminDataContext(supabase)
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
    }

    const { searchParams } = new URL(request.url)
    const periodType = (searchParams.get("period") ?? "this_month") as PeriodType
    const dateFrom = searchParams.get("dateFrom") ?? undefined
    const dateTo = searchParams.get("dateTo") ?? undefined

    let period
    try {
      period = resolveAdminPeriod(periodType, dateFrom, dateTo)
    } catch (error) {
      return NextResponse.json(
        { ok: false, message: error instanceof Error ? error.message : "기간 오류" },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const snapshot = await fetchGuildScopedSnapshot(admin, ctx.guildId, period)
    const aggregates = buildAdminAggregates(snapshot, period)

    return NextResponse.json({
      ok: true,
      identity: snapshot.identity,
      aggregates,
    })
  } catch (error) {
    console.error("[admin/data/aggregates GET]", error)
    return NextResponse.json(
      { ok: false, message: "기간별 집계를 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
