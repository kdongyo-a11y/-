import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { createGuildOnboarding } from "@/lib/supabase/guild-onboarding-saga"
import {
  checkOnboardingRateLimit,
  resolveClientKey,
} from "@/lib/onboarding-rate-limit"

const MAX_BODY_BYTES = 4096

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get("content-length")
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, message: "요청 크기가 너무 큽니다." },
        { status: 413 },
      )
    }

    const clientKey = resolveClientKey(request)
    const rateCheck = checkOnboardingRateLimit(clientKey)
    if (!rateCheck.ok) {
      return NextResponse.json(
        { ok: false, message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        { status: 429 },
      )
    }

    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if (!("error" in authResult)) {
      return NextResponse.json(
        { ok: false, message: "로그아웃 후 새 혈맹을 만들 수 있습니다." },
        { status: 403 },
      )
    }

    const rawBody = await request.text()
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, message: "요청 크기가 너무 큽니다." },
        { status: 413 },
      )
    }

    let body: {
      serverId?: string
      guildName?: string
      adminNickname?: string
      password?: string
    }
    try {
      body = JSON.parse(rawBody) as typeof body
    } catch {
      return NextResponse.json({ ok: false, message: "잘못된 요청 형식입니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await createGuildOnboarding(admin, {
      serverId: body.serverId ?? "",
      guildName: body.guildName ?? "",
      adminNickname: body.adminNickname ?? "",
      password: body.password ?? "",
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      message: "혈맹이 생성되었습니다.",
      guild: result.guild,
      adminMember: result.adminMember,
    })
  } catch (error) {
    console.error("[onboarding/create-guild]", error)
    return NextResponse.json(
      { ok: false, message: "혈맹 생성 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
