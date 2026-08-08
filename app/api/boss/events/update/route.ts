import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"
import { getSettlementByKey } from "@/lib/supabase/settlement-data"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

type Body = {
  slotId?: string
  action?: "extra_bosses" | "no_income" | "declare_income" | "cancel_no_income"
  extraMainBosses?: string[]
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

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const body = (await request.json()) as Body
    if (!body.slotId || !body.action) {
      return NextResponse.json({ ok: false, message: "필수 값이 누락되었습니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const event = await getBossEventBySlotId(admin, body.slotId, guildId)
    if (!event) {
      return NextResponse.json({ ok: false, message: "보스타임 이벤트를 찾을 수 없습니다." }, { status: 404 })
    }

    if (body.action === "extra_bosses") {
      const bosses = body.extraMainBosses ?? []
      const { error } = await admin
        .from("boss_events")
        .update({ extra_main_bosses: bosses })
        .eq("id", event.id)
        .eq("guild_id", guildId)

      if (error) {
        console.error("[boss/events/update]", error)
        return NextResponse.json({ ok: false, message: "저장에 실패했습니다." }, { status: 500 })
      }

      await admin.from("boss_event_spawns").delete().eq("boss_event_id", event.id)
      if (bosses.length > 0) {
        await admin.from("boss_event_spawns").insert(
          bosses.map((boss_name) => ({
            boss_event_id: event.id,
            boss_name,
            spawned: true,
          })),
        )
      }

      return NextResponse.json({ ok: true, message: "저장되었습니다." })
    }

    if (event.participation_status !== "closed") {
      return NextResponse.json(
        { ok: false, message: "참여체크 마감 후 처리할 수 있습니다." },
        { status: 400 },
      )
    }

    if (body.action === "no_income") {
      const { error } = await admin
        .from("boss_events")
        .update({
          income_status: "no_income",
          income_closed_at: new Date().toISOString(),
          income_closed_by: authResult.member.id,
        })
        .eq("id", event.id)
        .eq("guild_id", guildId)

      if (error) {
        console.error("[boss/events/update]", error)
        return NextResponse.json({ ok: false, message: "마감에 실패했습니다." }, { status: 500 })
      }

      return NextResponse.json({ ok: true, message: "수익 없음으로 마감되었습니다." })
    }

    if (body.action === "cancel_no_income") {
      if (event.income_status !== "no_income") {
        return NextResponse.json(
          { ok: false, message: "수익 없음으로 마감된 타임만 취소할 수 있습니다." },
          { status: 400 },
        )
      }

      const settlement = await getSettlementByKey(admin, guildId, "boss", body.slotId)
      if (settlement) {
        return NextResponse.json(
          { ok: false, message: "정산이 생성된 타임은 수익 없음 마감을 취소할 수 없습니다." },
          { status: 409 },
        )
      }

      const { error } = await admin
        .from("boss_events")
        .update({
          income_status: "unprocessed",
          income_closed_at: null,
          income_closed_by: null,
        })
        .eq("id", event.id)
        .eq("guild_id", guildId)

      if (error) {
        console.error("[boss/events/update cancel_no_income]", error)
        return NextResponse.json({ ok: false, message: "마감 취소에 실패했습니다." }, { status: 500 })
      }

      console.info("[boss/income-audit]", {
        action: "cancel_no_income",
        slotId: body.slotId,
        bossEventId: event.id,
        actorId: authResult.member.id,
        at: new Date().toISOString(),
      })

      return NextResponse.json({ ok: true, message: "수익 없음 마감이 취소되었습니다." })
    }

    if (event.income_status === "no_income") {
      return NextResponse.json(
        { ok: false, message: "이미 수익 없음으로 마감된 타임입니다." },
        { status: 400 },
      )
    }

    const { error } = await admin
      .from("boss_events")
      .update({ income_status: "income_declared" })
      .eq("id", event.id)
      .eq("guild_id", guildId)

    if (error) {
      console.error("[boss/events/update]", error)
      return NextResponse.json({ ok: false, message: "등록에 실패했습니다." }, { status: 500 })
    }

    return NextResponse.json({ ok: true, message: "수익 발생으로 등록되었습니다. 수익금을 입력해주세요." })
  } catch (error) {
    console.error("[boss/events/update]", error)
    return NextResponse.json(
      { ok: false, message: "처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
