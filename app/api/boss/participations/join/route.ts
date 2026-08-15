import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { slotIdFromEvent } from "@/lib/supabase/boss-mapper"
import { fetchBossPatchForOpenEvent } from "@/lib/supabase/boss-slot-delta"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { recordUsageEventFromActor } from "@/lib/platform/usage-events"
import { PerfTimer } from "@/lib/perf-log"

export async function POST(request: Request) {
  const perf = new PerfTimer("boss-participation-join")
  try {
    const supabase = await createClient()
    const authResult = await perf.measure("authMs", () => requireAuthenticatedMember(supabase))
    perf.addDbCalls(2)

    if ("error" in authResult) {
      perf.finish({ ok: false })
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const body = (await request.json()) as { code?: string }
    const trimmed = body.code?.trim() ?? ""
    if (!trimmed) {
      perf.finish({ ok: false, reason: "validation" })
      return NextResponse.json({ ok: false, message: "참여코드를 입력해주세요." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    const { data: openEvent, error: findError } = await admin
      .from("boss_events")
      .select("id, event_date, slot_hour, slot_type, check_code")
      .eq("guild_id", guildId)
      .eq("participation_status", "open")
      .eq("check_code", trimmed)
      .maybeSingle()

    if (findError) {
      console.error("[boss/participations/join]", findError)
      perf.finish({ ok: false, reason: "error" })
      return NextResponse.json(
        { ok: false, message: "참여 처리 중 오류가 발생했습니다." },
        { status: 500 },
      )
    }

    if (!openEvent) {
      const { count } = await admin
        .from("boss_events")
        .select("id", { count: "exact", head: true })
        .eq("guild_id", guildId)
        .eq("participation_status", "open")
      perf.addDbCalls(1)
      perf.finish({ ok: false, reason: "not_found" })
      return NextResponse.json(
        {
          ok: false,
          message:
            (count ?? 0) > 0
              ? "참여코드가 올바르지 않습니다."
              : "진행 중인 참여체크가 없습니다.",
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
    perf.addDbCalls(1)

    if (existing?.status === "participated") {
      const patch = await fetchBossPatchForOpenEvent(admin, guildId, openEvent.id)
      perf.addDbCalls(3)
      perf.finish({ ok: true, alreadyJoined: true })
      return NextResponse.json({
        ok: true,
        message: "이미 참여 완료되었습니다.",
        slotId: slotIdFromEvent(openEvent),
        patch,
      })
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
        perf.finish({ ok: false, reason: "error" })
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
        perf.finish({ ok: false, reason: "error" })
        return NextResponse.json({ ok: false, message: "참여 등록에 실패했습니다." }, { status: 500 })
      }
    }
    perf.addDbCalls(1)

    void recordUsageEventFromActor(
      "boss_participation",
      authResult.member,
      { slotType: openEvent.slot_type },
      admin,
    )

    const patch = await fetchBossPatchForOpenEvent(admin, guildId, openEvent.id)
    perf.addDbCalls(3)
    perf.finish({ ok: true })

    return NextResponse.json({
      ok: true,
      message: "참여 인증이 완료되었습니다!",
      slotId: slotIdFromEvent(openEvent),
      patch,
    })
  } catch (error) {
    console.error("[boss/participations/join]", error)
    perf.finish({ ok: false, reason: "error" })
    return NextResponse.json(
      { ok: false, message: "참여 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
