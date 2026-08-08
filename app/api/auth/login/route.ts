import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  fetchMemberByServerGuildNameAndNickname,
  resolveLoginBlockMessage,
} from "@/lib/supabase/auth-helpers"
import { rowToMember } from "@/lib/supabase/member-mapper"
import { normalizeGuildName } from "@/lib/guild-types"
import { recordUsageEvent } from "@/lib/platform/usage-events"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      serverId?: string
      guildName?: string
      nickname?: string
      password?: string
    }
    const serverId = body.serverId?.trim() ?? ""
    const guildName = normalizeGuildName(body.guildName ?? "")
    const nickname = body.nickname?.trim() ?? ""
    const password = body.password ?? ""

    if (!serverId || !guildName || !nickname || !password) {
      return NextResponse.json(
        { ok: false, message: "서버, 혈맹명, 캐릭터명, 비밀번호를 입력해주세요." },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const memberRow = await fetchMemberByServerGuildNameAndNickname(
      admin,
      serverId,
      guildName,
      nickname,
    )

    if (!memberRow) {
      return NextResponse.json(
        { ok: false, message: "서버, 혈맹명, 캐릭터명 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      )
    }

    const blockMessage = resolveLoginBlockMessage(
      memberRow.account_status,
      memberRow.status,
    )
    if (blockMessage) {
      return NextResponse.json({ ok: false, message: blockMessage }, { status: 403 })
    }

    const supabase = await createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: memberRow.internal_email,
      password,
    })

    if (signInError) {
      return NextResponse.json(
        { ok: false, message: "서버, 혈맹명, 캐릭터명 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      )
    }

    void recordUsageEvent(
      {
        eventType: "login_success",
        guildId: memberRow.guild_id,
        memberId: memberRow.id,
      },
      admin,
    )

    const member = rowToMember(memberRow)
    return NextResponse.json({
      ok: true,
      member,
      guildId: memberRow.guild_id,
      requiresPasswordChange: memberRow.must_change_password,
    })
  } catch (error) {
    console.error("[auth/login]", error)
    return NextResponse.json(
      { ok: false, message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
