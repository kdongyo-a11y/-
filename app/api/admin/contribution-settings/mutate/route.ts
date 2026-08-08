import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { createContributionScoreSettingOnServer } from "@/lib/supabase/admin-settings-data"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  isValidContributionScore,
  isValidEffectiveFrom,
} from "@/lib/contribution-score-settings"

type Body = {
  action?: "create_setting"
  generalBossScore?: number
  mainBossScore?: number
  siegeScore?: number
  effectiveFrom?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const body = (await request.json()) as Body
    if (body.action !== "create_setting") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    const generalBossScore = Number(body.generalBossScore)
    const mainBossScore = Number(body.mainBossScore)
    const siegeScore = Number(body.siegeScore)
    const effectiveFrom = body.effectiveFrom ?? ""

    if (!isValidEffectiveFrom(effectiveFrom)) {
      return NextResponse.json(
        { ok: false, message: "적용 시작일 형식이 올바르지 않습니다. (YYYY-MM-DD)" },
        { status: 400 },
      )
    }
    if (
      !isValidContributionScore(generalBossScore) ||
      !isValidContributionScore(mainBossScore) ||
      !isValidContributionScore(siegeScore)
    ) {
      return NextResponse.json(
        { ok: false, message: "점수는 0 이상 100 이하 숫자여야 합니다." },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const result = await createContributionScoreSettingOnServer(
      admin,
      authResult.member.id,
      actorGuildId(authResult.member),
      {
      generalBossScore,
      mainBossScore,
      siegeScore,
      effectiveFrom,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "기여도 점수 설정이 저장되었습니다.",
      setting: result.setting,
    })
  } catch (error) {
    console.error("[admin/contribution-settings/mutate]", error)
    return NextResponse.json(
      { ok: false, message: "기여도 점수 설정 저장 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
