import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { uiSurveyToDb } from "@/lib/supabase/siege-mapper"
import { isSundayDate } from "@/lib/siege-utils"
import { getSiegeByIdForGuild } from "@/lib/supabase/siege-event-helpers"
import { actorGuildId, requireMemberInActorGuild } from "@/lib/supabase/guild-scope-helpers"

type SurveyResponseUi = "참여 예정" | "불참 예정"

type Body = {
  action?: string
  siegeId?: string
  eventDate?: string
  startTime?: string
  endTime?: string
  memo?: string
  memberId?: string
  response?: SurveyResponseUi
  settlementKey?: string
}

const ATTENDANCE_EDIT_STATUSES = new Set([
  "attendance_confirming",
  "attendance_confirmed",
  "settling",
])

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

    const body = (await request.json()) as Body
    if (!body.action) {
      return NextResponse.json({ ok: false, message: "action이 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const actorId = authResult.member.id
    const guildId = actorGuildId(authResult.member)
    const now = new Date().toISOString()

    if (body.action === "create") {
      const roleCheck = requireManagerOrAdmin(authResult.member)
      if (!roleCheck.ok) {
        return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
      }

      const eventDate = body.eventDate ?? ""
      if (!isSundayDate(eventDate)) {
        return NextResponse.json({ ok: false, message: "공성 날짜는 일요일이어야 합니다." }, { status: 400 })
      }

      const { error } = await admin.from("siege_events").insert({
        guild_id: guildId,
        event_date: eventDate,
        start_time: body.startTime ?? "20:00",
        end_time: body.endTime ?? "21:00",
        memo: body.memo?.trim() ?? "",
      })

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json(
            { ok: false, message: "이미 해당 날짜의 공성이 생성되어 있습니다." },
            { status: 409 },
          )
        }
        console.error("[siege/mutate create]", error)
        return NextResponse.json({ ok: false, message: "공성 생성에 실패했습니다." }, { status: 500 })
      }

      return NextResponse.json({ ok: true, message: "공성 이벤트가 생성되었습니다." })
    }

    const siege = body.siegeId ? await getSiegeByIdForGuild(admin, body.siegeId, guildId) : null
    if (!siege && body.action !== "submit_survey") {
      return NextResponse.json({ ok: false, message: "공성을 찾을 수 없습니다." }, { status: 404 })
    }

    switch (body.action) {
      case "start_survey": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (siege!.status !== "draft") {
          return NextResponse.json(
            { ok: false, message: "생성 직후 공성만 참여조사를 시작할 수 있습니다." },
            { status: 400 },
          )
        }
        await admin
          .from("siege_events")
          .update({ status: "survey_open", survey_opened_at: now })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)
        await admin.from("siege_surveys").delete().eq("siege_event_id", siege!.id)
        return NextResponse.json({ ok: true, message: "참여조사가 시작되었습니다." })
      }

      case "close_survey": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (siege!.status !== "survey_open") {
          return NextResponse.json({ ok: false, message: "진행 중인 참여조사가 없습니다." }, { status: 400 })
        }
        await admin
          .from("siege_events")
          .update({ status: "survey_closed", survey_closed_at: now })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)
        return NextResponse.json({ ok: true, message: "참여조사가 마감되었습니다." })
      }

      case "submit_survey": {
        if (!body.siegeId || !body.response) {
          return NextResponse.json({ ok: false, message: "필수 값이 누락되었습니다." }, { status: 400 })
        }
        const targetSiege = await getSiegeByIdForGuild(admin, body.siegeId, guildId)
        if (!targetSiege || targetSiege.status !== "survey_open") {
          return NextResponse.json({ ok: false, message: "참여조사 기간이 아닙니다." }, { status: 400 })
        }
        await admin.from("siege_surveys").upsert(
          {
            siege_event_id: targetSiege.id,
            member_id: actorId,
            response: uiSurveyToDb(body.response),
            updated_at: now,
          },
          { onConflict: "siege_event_id,member_id" },
        )
        return NextResponse.json({ ok: true, message: `${body.response}(으)로 등록되었습니다.` })
      }

      case "admin_survey_update": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (!body.memberId || !body.response) {
          return NextResponse.json({ ok: false, message: "필수 값이 누락되었습니다." }, { status: 400 })
        }
        const memberCheck = await requireMemberInActorGuild(admin, guildId, body.memberId)
        if (!memberCheck.ok) {
          return NextResponse.json(
            { ok: false, message: memberCheck.message },
            { status: memberCheck.status },
          )
        }

        const { data: beforeRow } = await admin
          .from("siege_surveys")
          .select("response")
          .eq("siege_event_id", siege!.id)
          .eq("member_id", body.memberId)
          .maybeSingle()

        await admin.from("siege_surveys").upsert(
          {
            siege_event_id: siege!.id,
            member_id: body.memberId,
            response: uiSurveyToDb(body.response),
            updated_at: now,
          },
          { onConflict: "siege_event_id,member_id" },
        )

        await admin.from("siege_admin_logs").insert({
          siege_event_id: siege!.id,
          phase: "survey",
          target_member_id: body.memberId,
          before_state: beforeRow?.response === "attending" ? "참여 예정" : beforeRow?.response === "not_attending" ? "불참 예정" : "미응답",
          after_state: body.response,
          memo: body.memo?.trim() ?? "",
          action: "사전조사 수정",
          created_by: actorId,
        })

        return NextResponse.json({ ok: true, message: "저장되었습니다." })
      }

      case "start_attendance": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (siege!.status !== "survey_closed") {
          return NextResponse.json(
            { ok: false, message: "참여조사 마감 후 실제 참여 확정을 시작할 수 있습니다." },
            { status: 400 },
          )
        }

        const { data: intendedSurveys } = await admin
          .from("siege_surveys")
          .select("member_id")
          .eq("siege_event_id", siege!.id)
          .eq("response", "attending")

        await admin.from("siege_participations").delete().eq("siege_event_id", siege!.id)

        if (intendedSurveys && intendedSurveys.length > 0) {
          await admin.from("siege_participations").insert(
            intendedSurveys.map((row) => ({
              siege_event_id: siege!.id,
              member_id: row.member_id,
              source: "confirmed",
              status: "participated",
              was_survey_intended: true,
              confirmed_at: now,
              created_by: actorId,
            })),
          )
        }

        await admin
          .from("siege_events")
          .update({ status: "attendance_confirming" })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)

        return NextResponse.json({
          ok: true,
          message: `사전 참여 예정 ${intendedSurveys?.length ?? 0}명을 후보로 불러왔습니다.`,
        })
      }

      case "finalize_attendance": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (siege!.status !== "attendance_confirming") {
          return NextResponse.json(
            { ok: false, message: "실제 참여 확정 진행 중인 공성만 마감할 수 있습니다." },
            { status: 400 },
          )
        }

        const { count } = await admin
          .from("siege_participations")
          .select("id", { count: "exact", head: true })
          .eq("siege_event_id", siege!.id)
          .eq("status", "participated")

        if ((count ?? 0) === 0) {
          return NextResponse.json({ ok: false, message: "확정된 참여자가 없습니다." }, { status: 400 })
        }

        await admin
          .from("siege_events")
          .update({ status: "attendance_confirmed", attendance_confirmed_at: now })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)

        return NextResponse.json({
          ok: true,
          message: `실제 참여 ${count}명 확정되었습니다.`,
        })
      }

      case "add_participant":
      case "remove_participant":
      case "confirm_attendee": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (!body.memberId) {
          return NextResponse.json({ ok: false, message: "memberId가 필요합니다." }, { status: 400 })
        }
        const memberCheck = await requireMemberInActorGuild(admin, guildId, body.memberId)
        if (!memberCheck.ok) {
          return NextResponse.json(
            { ok: false, message: memberCheck.message },
            { status: memberCheck.status },
          )
        }
        if (!ATTENDANCE_EDIT_STATUSES.has(siege!.status)) {
          return NextResponse.json({ ok: false, message: "참여자를 수정할 수 없는 상태입니다." }, { status: 400 })
        }

        const memo = body.memo?.trim() ?? ""
        if (body.action !== "confirm_attendee" && !memo) {
          return NextResponse.json({ ok: false, message: "사유를 입력해주세요." }, { status: 400 })
        }

        if (body.action === "confirm_attendee") {
          const { data: existing } = await admin
            .from("siege_participations")
            .select("id, status")
            .eq("siege_event_id", siege!.id)
            .eq("member_id", body.memberId)
            .maybeSingle()

          if (existing?.status === "participated") {
            return NextResponse.json({ ok: true, message: "이미 참여 확정된 혈원입니다." })
          }

          const { data: surveyRow } = await admin
            .from("siege_surveys")
            .select("response")
            .eq("siege_event_id", siege!.id)
            .eq("member_id", body.memberId)
            .maybeSingle()

          const wasSurveyIntended = surveyRow?.response === "attending"

          if (existing) {
            await admin
              .from("siege_participations")
              .update({
                status: "participated",
                source: wasSurveyIntended ? "confirmed" : "manual",
                was_survey_intended: wasSurveyIntended,
                confirmed_at: now,
                created_by: actorId,
              })
              .eq("id", existing.id)
          } else {
            await admin.from("siege_participations").insert({
              siege_event_id: siege!.id,
              member_id: body.memberId,
              source: wasSurveyIntended ? "confirmed" : "manual",
              status: "participated",
              was_survey_intended: wasSurveyIntended,
              confirmed_at: now,
              created_by: actorId,
            })
          }

          return NextResponse.json({ ok: true, message: "참여자가 확정되었습니다." })
        }

        if (body.action === "add_participant") {
          const { data: existing } = await admin
            .from("siege_participations")
            .select("id, status")
            .eq("siege_event_id", siege!.id)
            .eq("member_id", body.memberId)
            .maybeSingle()

          if (existing?.status === "participated") {
            return NextResponse.json({ ok: false, message: "이미 참여 확정된 혈원입니다." }, { status: 400 })
          }

          const { data: surveyRow } = await admin
            .from("siege_surveys")
            .select("response")
            .eq("siege_event_id", siege!.id)
            .eq("member_id", body.memberId)
            .maybeSingle()

          const wasSurveyIntended = surveyRow?.response === "attending"

          if (existing) {
            await admin
              .from("siege_participations")
              .update({
                status: "participated",
                source: "manual",
                memo,
                was_survey_intended: wasSurveyIntended,
                confirmed_at: now,
                created_by: actorId,
              })
              .eq("id", existing.id)
          } else {
            await admin.from("siege_participations").insert({
              siege_event_id: siege!.id,
              member_id: body.memberId,
              source: "manual",
              status: "participated",
              memo,
              was_survey_intended: wasSurveyIntended,
              confirmed_at: now,
              created_by: actorId,
            })
          }

          await admin.from("siege_attendance_logs").insert({
            siege_event_id: siege!.id,
            member_id: body.memberId,
            change_type: "ADD",
            before_state: "미참여",
            after_state: "참여 확정",
            reason: memo,
            created_by: actorId,
          })
        } else {
          const { data: existing } = await admin
            .from("siege_participations")
            .select("id")
            .eq("siege_event_id", siege!.id)
            .eq("member_id", body.memberId)
            .eq("status", "participated")
            .maybeSingle()

          if (!existing) {
            return NextResponse.json({ ok: false, message: "참여 확정 명단에 없는 혈원입니다." }, { status: 400 })
          }

          await admin.from("siege_participations").delete().eq("id", existing.id)

          await admin.from("siege_attendance_logs").insert({
            siege_event_id: siege!.id,
            member_id: body.memberId,
            change_type: "REMOVE",
            before_state: "참여 확정",
            after_state: "참여 제외",
            reason: memo,
            created_by: actorId,
          })
        }

        return NextResponse.json({ ok: true, message: "저장되었습니다." })
      }

      case "link_settlement": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        await admin
          .from("siege_events")
          .update({
            settlement_source_key: body.settlementKey ?? null,
            settlement_status: "in_progress",
            status: siege!.status === "attendance_confirmed" ? "settling" : siege!.status,
          })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)
        return NextResponse.json({ ok: true, message: "정산이 연결되었습니다." })
      }

      case "no_income": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        await admin
          .from("siege_events")
          .update({
            income_status: "no_income",
            status: "completed",
            settlement_status: "completed",
          })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)
        return NextResponse.json({ ok: true, message: "수익 없음으로 마감되었습니다." })
      }

      case "declare_income": {
        const roleCheck = requireManagerOrAdmin(authResult.member)
        if (!roleCheck.ok) {
          return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
        }
        if (siege!.income_status === "no_income") {
          return NextResponse.json(
            { ok: false, message: "이미 수익 없음으로 마감된 공성입니다." },
            { status: 400 },
          )
        }
        await admin
          .from("siege_events")
          .update({ income_status: "income_declared" })
          .eq("id", siege!.id)
          .eq("guild_id", guildId)
        return NextResponse.json({ ok: true, message: "수익 발생으로 등록되었습니다." })
      }

      default:
        return NextResponse.json({ ok: false, message: "지원하지 않는 action입니다." }, { status: 400 })
    }
  } catch (error) {
    console.error("[siege/mutate]", error)
    return NextResponse.json(
      { ok: false, message: "공성 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
