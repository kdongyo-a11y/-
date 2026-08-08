import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"
import { actorGuildId, requireMemberInActorGuild } from "@/lib/supabase/guild-scope-helpers"
import { recordUsageEvent } from "@/lib/platform/usage-events"

type Body = {
  slotId?: string
  memberId?: string
  memo?: string
  action?: "add" | "remove"
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
    if (!body.slotId || !body.memberId || !body.action) {
      return NextResponse.json({ ok: false, message: "필수 값이 누락되었습니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    const memberCheck = await requireMemberInActorGuild(admin, guildId, body.memberId)
    if (!memberCheck.ok) {
      return NextResponse.json(
        { ok: false, message: memberCheck.message },
        { status: memberCheck.status },
      )
    }

    const event = await getBossEventBySlotId(admin, body.slotId, guildId)
    if (!event) {
      return NextResponse.json({ ok: false, message: "보스타임 이벤트를 찾을 수 없습니다." }, { status: 404 })
    }

    const memo = body.memo?.trim() ?? ""

    if (body.action === "add") {
      const { data: existing } = await admin
        .from("boss_participations")
        .select("id, status")
        .eq("boss_event_id", event.id)
        .eq("member_id", body.memberId)
        .maybeSingle()

      if (existing?.status === "participated") {
        return NextResponse.json({ ok: true, message: "이미 참여 중입니다." })
      }

      if (existing) {
        await admin
          .from("boss_participations")
          .update({
            status: "participated",
            source: "manual",
            memo,
            joined_at: new Date().toISOString(),
            created_by: authResult.member.id,
          })
          .eq("id", existing.id)
      } else {
        await admin.from("boss_participations").insert({
          boss_event_id: event.id,
          member_id: body.memberId,
          source: "manual",
          status: "participated",
          memo,
          created_by: authResult.member.id,
        })
      }

      await admin.from("boss_participation_logs").insert({
        boss_event_id: event.id,
        target_member_id: body.memberId,
        before_state: "미참여",
        after_state: "참여",
        memo,
        action: "수동추가",
        created_by: authResult.member.id,
      })

      void recordUsageEvent(
        {
          eventType: "boss_participation",
          guildId,
          memberId: body.memberId,
          metadata: { slotType: event.slot_type, source: "manual" },
        },
        admin,
      )
    } else {
      await admin
        .from("boss_participations")
        .delete()
        .eq("boss_event_id", event.id)
        .eq("member_id", body.memberId)

      await admin.from("boss_participation_logs").insert({
        boss_event_id: event.id,
        target_member_id: body.memberId,
        before_state: "참여",
        after_state: "미참여",
        memo,
        action: "수동제외",
        created_by: authResult.member.id,
      })
    }

    return NextResponse.json({ ok: true, message: "저장되었습니다." })
  } catch (error) {
    console.error("[boss/participations/manual]", error)
    return NextResponse.json(
      { ok: false, message: "참여자 수정 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
