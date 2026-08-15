import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"
import { fetchBossSlotPatch } from "@/lib/supabase/boss-slot-delta"
import { actorGuildId, requireMemberInActorGuild } from "@/lib/supabase/guild-scope-helpers"
import { recordUsageEvent } from "@/lib/platform/usage-events"
import { PerfTimer } from "@/lib/perf-log"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { BossEventRow } from "@/lib/supabase/boss-mapper"

type Body = {
  slotId?: string
  memberId?: string
  memo?: string
  action?: "add" | "remove"
  batch?: Array<{ memberId: string; action: "add" | "remove"; memo?: string }>
}

async function applyManualParticipation(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  event: BossEventRow,
  memberId: string,
  action: "add" | "remove",
  memo: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const memberCheck = await requireMemberInActorGuild(admin, guildId, memberId)
  if (!memberCheck.ok) {
    return { ok: false, message: memberCheck.message }
  }

  if (action === "add") {
    const { data: existing } = await admin
      .from("boss_participations")
      .select("id, status")
      .eq("boss_event_id", event.id)
      .eq("member_id", memberId)
      .maybeSingle()

    if (existing?.status === "participated") {
      return { ok: true }
    }

    if (existing) {
      const { error } = await admin
        .from("boss_participations")
        .update({
          status: "participated",
          source: "manual",
          memo,
          joined_at: new Date().toISOString(),
          created_by: actorId,
        })
        .eq("id", existing.id)
      if (error) {
        console.error("[boss/participations/manual]", error)
        return { ok: false, message: "참여자 추가에 실패했습니다." }
      }
    } else {
      const { error } = await admin.from("boss_participations").insert({
        boss_event_id: event.id,
        member_id: memberId,
        source: "manual",
        status: "participated",
        memo,
        created_by: actorId,
      })
      if (error) {
        console.error("[boss/participations/manual]", error)
        return { ok: false, message: "참여자 추가에 실패했습니다." }
      }
    }

    await admin.from("boss_participation_logs").insert({
      boss_event_id: event.id,
      target_member_id: memberId,
      before_state: "미참여",
      after_state: "참여",
      memo,
      action: "수동추가",
      created_by: actorId,
    })

    void recordUsageEvent(
      {
        eventType: "boss_participation",
        guildId,
        memberId,
        metadata: { slotType: event.slot_type, source: "manual" },
      },
      admin,
    )
    return { ok: true }
  }

  await admin
    .from("boss_participations")
    .delete()
    .eq("boss_event_id", event.id)
    .eq("member_id", memberId)

  await admin.from("boss_participation_logs").insert({
    boss_event_id: event.id,
    target_member_id: memberId,
    before_state: "참여",
    after_state: "미참여",
    memo,
    action: "수동제외",
    created_by: actorId,
  })

  return { ok: true }
}

export async function POST(request: Request) {
  const perf = new PerfTimer("boss-manual-batch")
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

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      perf.finish({ ok: false })
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const body = (await request.json()) as Body
    if (!body.slotId) {
      perf.finish({ ok: false, reason: "validation" })
      return NextResponse.json({ ok: false, message: "slotId가 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const event = await getBossEventBySlotId(admin, body.slotId, guildId)
    perf.addDbCalls(1)

    if (!event) {
      perf.finish({ ok: false, reason: "not_found" })
      return NextResponse.json({ ok: false, message: "보스타임 이벤트를 찾을 수 없습니다." }, { status: 404 })
    }

    const batchItems =
      body.batch && body.batch.length > 0
        ? body.batch
        : body.memberId && body.action
          ? [{ memberId: body.memberId, action: body.action, memo: body.memo }]
          : []

    if (batchItems.length === 0) {
      perf.finish({ ok: false, reason: "validation" })
      return NextResponse.json({ ok: false, message: "필수 값이 누락되었습니다." }, { status: 400 })
    }

    const results: Array<{ memberId: string; ok: boolean; message: string }> = []
    let dbCalls = 0

    for (const item of batchItems) {
      const memo = item.memo?.trim() ?? body.memo?.trim() ?? ""
      const result = await applyManualParticipation(
        admin,
        authResult.member.id,
        guildId,
        event,
        item.memberId,
        item.action,
        memo,
      )
      dbCalls += item.action === "add" ? 3 : 2
      results.push({
        memberId: item.memberId,
        ok: result.ok,
        message: result.ok ? "저장되었습니다." : result.message,
      })
    }

    const patch = await fetchBossSlotPatch(admin, guildId, body.slotId)
    patch.patchLevel = "attendee"
    dbCalls += 3

    const successCount = results.filter((r) => r.ok).length
    const allOk = successCount === results.length

    perf.addDbCalls(dbCalls)
    perf.finish({ ok: allOk, batchSize: results.length, successCount })

    return NextResponse.json({
      ok: allOk,
      message: allOk
        ? "저장되었습니다."
        : `${successCount}/${results.length}명 처리 완료`,
      slotId: body.slotId,
      patch,
      results,
    })
  } catch (error) {
    console.error("[boss/participations/manual]", error)
    perf.finish({ ok: false, reason: "error" })
    return NextResponse.json(
      { ok: false, message: "참여자 수정 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
