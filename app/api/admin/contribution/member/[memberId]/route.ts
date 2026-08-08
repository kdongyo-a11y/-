import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { fetchMemberActivity } from "@/lib/supabase/member-activity-data"
import { requireMemberInActorGuild, actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  getAllTimePeriod,
  getLastMonthPeriod,
  getThisMonthPeriod,
  getYearMonthPeriod,
} from "@/lib/contribution-utils"

export async function GET(
  request: Request,
  context: { params: Promise<{ memberId: string }> },
) {
  try {
    const { memberId } = await context.params
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const { searchParams } = new URL(request.url)
    const months = Math.min(Number(searchParams.get("months") ?? 12), 24)
    const admin = createAdminClient()
    const memberCheck = await requireMemberInActorGuild(
      admin,
      actorGuildId(authResult.member),
      memberId,
    )
    if (!memberCheck.ok) {
      return NextResponse.json(
        { ok: false, message: memberCheck.message },
        { status: memberCheck.status },
      )
    }

    const today = new Date().toISOString().slice(0, 10)

    const monthlyScores: { yearMonth: string; total: number }[] = []
    for (let i = 0; i < months; i++) {
      const d = new Date(`${today}T12:00:00`)
      d.setMonth(d.getMonth() - i)
      const ym = d.toISOString().slice(0, 7)
      const period = getYearMonthPeriod(ym)
      const activity = await fetchMemberActivity(admin, memberId, period)
      monthlyScores.push({ yearMonth: ym, total: activity.summary.contributionTotal })
    }

    const allTime = await fetchMemberActivity(admin, memberId, getAllTimePeriod())
    const thisMonth = await fetchMemberActivity(admin, memberId, getThisMonthPeriod())
    const lastMonth = await fetchMemberActivity(admin, memberId, getLastMonthPeriod())

    return NextResponse.json({
      ok: true,
      thisMonth: thisMonth.summary.contributionTotal,
      lastMonth: lastMonth.summary.contributionTotal,
      allTime: allTime.summary.contributionTotal,
      monthlyScores,
    })
  } catch (error) {
    console.error("[admin/contribution/member GET]", error)
    return NextResponse.json(
      { ok: false, message: "기여도 정보를 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
