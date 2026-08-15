import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { generateBossCheckCode } from "@/lib/supabase/boss-mapper"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"
import { fetchBossSlotPatch } from "@/lib/supabase/boss-slot-delta"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

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

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const body = (await request.json()) as { slotId?: string }
    if (!body.slotId) {
      return NextResponse.json({ ok: false, message: "slotId가 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const event = await getBossEventBySlotId(admin, body.slotId, guildId)
    if (!event || event.participation_status !== "open") {
      return NextResponse.json(
        { ok: false, message: "진행 중인 참여체크가 없습니다." },
        { status: 400 },
      )
    }

    const code = generateBossCheckCode()
    const { error } = await admin
      .from("boss_events")
      .update({ check_code: code })
      .eq("id", event.id)
      .eq("guild_id", guildId)

    if (error) {
      console.error("[boss/check/regenerate-code]", error)
      return NextResponse.json({ ok: false, message: "코드 재생성에 실패했습니다." }, { status: 500 })
    }

    const patch = await fetchBossSlotPatch(admin, guildId, body.slotId)

    return NextResponse.json({
      ok: true,
      message: "참여코드를 재생성했습니다.",
      slotId: body.slotId,
      patch,
    })
  } catch (error) {
    console.error("[boss/check/regenerate-code]", error)
    return NextResponse.json(
      { ok: false, message: "코드 재생성 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
