import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  createGuildCashCheckpoint,
  fetchGuildCashCheckpoints,
} from "@/lib/supabase/guild-cash-data"
import { errorToMessage } from "@/lib/supabase/db-errors"

type Body = {
  action?: "create_checkpoint" | "list_checkpoints"
  effectiveAt?: string
  openingCashBalance?: number
  memo?: string
}

export async function GET() {
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

    const guildId = actorGuildId(authResult.member)
    const checkpoints = await fetchGuildCashCheckpoints(supabase, guildId)
    return NextResponse.json({ ok: true, checkpoints })
  } catch (error) {
    console.error("[finance/cash-checkpoint GET]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "checkpoint 목록을 불러오지 못했습니다.") },
      { status: 500 },
    )
  }
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
    if (body.action !== "create_checkpoint") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    if (!body.memo?.trim()) {
      return NextResponse.json({ ok: false, message: "메모(사유)를 입력해주세요." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const result = await createGuildCashCheckpoint(admin, guildId, authResult.member.id, {
      effectiveAt: body.effectiveAt ?? new Date().toISOString(),
      openingCashBalance: Number(body.openingCashBalance),
      memo: body.memo,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "실보유액 기준점이 저장되었습니다.",
      checkpoint: result.checkpoint,
    })
  } catch (error) {
    console.error("[finance/cash-checkpoint POST]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "checkpoint 저장 중 오류가 발생했습니다.") },
      { status: 500 },
    )
  }
}
