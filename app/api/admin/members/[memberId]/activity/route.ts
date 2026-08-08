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
  type ContributionPeriod,
} from "@/lib/contribution-utils"

function resolvePeriod(periodKey: string): ContributionPeriod {
  if (periodKey === "this_month") return getThisMonthPeriod()
  if (periodKey === "last_month") return getLastMonthPeriod()
  if (periodKey === "all") return getAllTimePeriod()
  if (/^\d{4}-\d{2}$/.test(periodKey)) return getYearMonthPeriod(periodKey)
  return getThisMonthPeriod()
}

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
    const periodKey = searchParams.get("period") ?? "this_month"
    const period = resolvePeriod(periodKey)

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

    const activity = await fetchMemberActivity(admin, memberId, period)

    return NextResponse.json({ ok: true, period, activity })
  } catch (error) {
    console.error("[admin/members/activity GET]", error)
    return NextResponse.json(
      { ok: false, message: "활동 현황을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
