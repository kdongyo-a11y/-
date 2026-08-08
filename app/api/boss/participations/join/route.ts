import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { slotIdFromEvent } from "@/lib/supabase/boss-mapper"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { recordUsageEventFromActor } from "@/lib/platform/usage-events"

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

    const body = (await request.json()) as { code?: string }
    const trimmed = body.code?.trim() ?? ""
    if (!trimmed) {
      return NextResponse.json({ ok: false, message: "참여코드를 입력해주세요." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    const { data: openEvents, error: findError } = await admin
      .from("boss_events")
      .select("*")
      .eq("guild_id", guildId)
      .eq("participation_status", "open")

    if (findError) {
      console.error("[boss/participations/join]", findError)
      return NextResponse.json(
        { ok: false, message: "참여 처리 중 오류가 발생했습니다." },
        { status: 500 },
      )
    }

    const openEvent = (openEvents ?? []).find((e) => e.check_code === trimmed) ?? null

    if (!openEvent) {
      const hasOpen = (openEvents ?? []).length > 0
      return NextResponse.json(
        {
          ok: false,
          message: hasOpen ? "참여코드가 올바르지 않습니다." : "진행 중인 참여체크가 없습니다.",
        },
        { status: 400 },
      )
    }

    const memberId = authResult.member.id

    const { data: existing } = await admin
      .from("boss_participations")
      .select("id, status")
      .eq("boss_event_id", openEvent.id)
      .eq("member_id", memberId)
      .maybeSingle()

    if (existing?.status === "participated") {
      return NextResponse.json({ ok: true, message: "이미 참여 완료되었습니다." })
    }

    if (existing) {
      const { error } = await admin
        .from("boss_participations")
        .update({
          status: "participated",
          source: "code",
          joined_at: new Date().toISOString(),
        })
        .eq("id", existing.id)

      if (error) {
        console.error("[boss/participations/join]", error)
        return NextResponse.json({ ok: false, message: "참여 등록에 실패했습니다." }, { status: 500 })
      }
    } else {
      const { error } = await admin.from("boss_participations").insert({
        boss_event_id: openEvent.id,
        member_id: memberId,
        source: "code",
        status: "participated",
      })

      if (error) {
        console.error("[boss/participations/join]", error)
        return NextResponse.json({ ok: false, message: "참여 등록에 실패했습니다." }, { status: 500 })
      }
    }

    void recordUsageEventFromActor(
      "boss_participation",
      authResult.member,
      { slotType: openEvent.slot_type },
      admin,
    )

    return NextResponse.json({
      ok: true,
      message: "참여 인증이 완료되었습니다!",
      slotId: slotIdFromEvent(openEvent),
    })
  } catch (error) {
    console.error("[boss/participations/join]", error)
    return NextResponse.json(
      { ok: false, message: "참여 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
