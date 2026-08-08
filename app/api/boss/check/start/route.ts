import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import {
  generateBossCheckCode,
  parseSlotId,
  slotIdFromEvent,
} from "@/lib/supabase/boss-mapper"
import { getSlotConfig } from "@/lib/boss-time-slots"
import { formatDbError } from "@/lib/supabase/db-errors"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

async function hasBossSettlement(
  admin: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  guildId: string,
  slotId: string,
): Promise<boolean> {
  const { data, error } = await admin
    .from("settlements")
    .select("id")
    .eq("guild_id", guildId)
    .eq("source_type", "boss")
    .eq("source_id", slotId)
    .maybeSingle()

  if (error) {
    if (error.code === "42P01") return false
    console.error("[boss/check/start] settlements lookup", error)
    return false
  }

  return !!data
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

    const body = (await request.json()) as { slotId?: string }
    if (!body.slotId) {
      return NextResponse.json(
        { ok: false, message: "slotId가 필요합니다." },
        { status: 400 },
      )
    }

    const parsed = parseSlotId(body.slotId)
    if (!parsed) {
      return NextResponse.json(
        { ok: false, message: "올바르지 않은 slotId입니다." },
        { status: 400 },
      )
    }

    const slotConfig = getSlotConfig(parsed.slotHour)
    if (!slotConfig) {
      return NextResponse.json(
        { ok: false, message: "올바르지 않은 보스타임입니다." },
        { status: 400 },
      )
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const now = new Date().toISOString()
    const code = generateBossCheckCode()

    const { data: openEvents, error: openEventsError } = await admin
      .from("boss_events")
      .select("id, event_date, slot_hour")
      .eq("guild_id", guildId)
      .eq("participation_status", "open")

    if (openEventsError) {
      console.error("[boss/check/start] open events", openEventsError)
      return NextResponse.json(
        { ok: false, message: formatDbError(openEventsError, "보스타임 기록을 조회하지 못했습니다.") },
        { status: 500 },
      )
    }

    for (const open of openEvents ?? []) {
      if (slotIdFromEvent(open) === body.slotId) continue
      const { error: closeError } = await admin
        .from("boss_events")
        .update({
          participation_status: "closed",
          check_closed_at: now,
          check_code: null,
        })
        .eq("id", open.id)
        .eq("guild_id", guildId)

      if (closeError) {
        console.error("[boss/check/start] auto-close", closeError)
        return NextResponse.json(
          { ok: false, message: formatDbError(closeError, "다른 참여체크를 마감하지 못했습니다.") },
          { status: 500 },
        )
      }
    }

    const { data: existing, error: existingError } = await admin
      .from("boss_events")
      .select("id, participation_status, income_status")
      .eq("guild_id", guildId)
      .eq("event_date", parsed.eventDate)
      .eq("slot_hour", parsed.slotHour)
      .maybeSingle()

    if (existingError) {
      console.error("[boss/check/start] existing lookup", existingError)
      return NextResponse.json(
        { ok: false, message: formatDbError(existingError, "보스타임 기록을 조회하지 못했습니다.") },
        { status: 500 },
      )
    }

    if (existing?.participation_status === "closed") {
      if (existing.income_status !== "unprocessed") {
        return NextResponse.json(
          {
            ok: false,
            message: "수익 처리가 시작된 타임은 참여체크를 다시 시작할 수 없습니다.",
          },
          { status: 400 },
        )
      }

      if (await hasBossSettlement(admin, guildId, body.slotId)) {
        return NextResponse.json(
          { ok: false, message: "정산이 등록된 타임은 참여체크를 다시 시작할 수 없습니다." },
          { status: 400 },
        )
      }
    }

    if (existing) {
      const { error } = await admin
        .from("boss_events")
        .update({
          participation_status: "open",
          check_code: code,
          check_started_at: now,
          check_closed_at: null,
        })
        .eq("id", existing.id)
        .eq("guild_id", guildId)

      if (error) {
        console.error("[boss/check/start] update", error)
        return NextResponse.json(
          { ok: false, message: formatDbError(error, "시작에 실패했습니다.") },
          { status: 500 },
        )
      }
    } else {
      const { error } = await admin.from("boss_events").insert({
        guild_id: guildId,
        event_date: parsed.eventDate,
        slot_hour: parsed.slotHour,
        slot_type: slotConfig.type,
        participation_status: "open",
        check_code: code,
        check_started_at: now,
      })

      if (error) {
        console.error("[boss/check/start] insert", error)
        return NextResponse.json(
          { ok: false, message: formatDbError(error, "시작에 실패했습니다.") },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({ ok: true, message: "참여체크를 시작했습니다." })
  } catch (error) {
    console.error("[boss/check/start]", error)
    return NextResponse.json(
      { ok: false, message: "참여체크 시작 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
