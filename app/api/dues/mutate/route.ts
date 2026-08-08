import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { formatYearMonthLabel } from "@/lib/dues-types"
import { errorToMessage } from "@/lib/supabase/db-errors"
import { cancelLedgerBySource, uiDuesStatusToDb, upsertLedgerEntry } from "@/lib/supabase/finance-data"
import {
  actorGuildId,
  requireDueInActorGuild,
  requireMemberInActorGuild,
} from "@/lib/supabase/guild-scope-helpers"
import type { DuesPaymentStatus } from "@/lib/dues-types"

type Body = {
  action?: string
  yearMonth?: string
  amountPerMember?: number
  dueDate?: string
  memo?: string
  billId?: string
  memberId?: string
  status?: DuesPaymentStatus
  changeMemo?: string
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

    const body = (await request.json()) as Body
    if (!body.action) {
      return NextResponse.json({ ok: false, message: "action이 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const actorId = authResult.member.id
    const guildId = actorGuildId(authResult.member)

    if (body.action === "create_bill") {
      const roleCheck = requireManagerOrAdmin(authResult.member)
      if (!roleCheck.ok) {
        return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
      }

      const yearMonth = body.yearMonth ?? ""
      const amountPerMember = body.amountPerMember ?? 0
      const dueDate = body.dueDate ?? ""

      if (amountPerMember <= 0) {
        return NextResponse.json({ ok: false, message: "1인 혈비는 0보다 커야 합니다." }, { status: 400 })
      }
      if (!dueDate) {
        return NextResponse.json({ ok: false, message: "납부기한을 입력해주세요." }, { status: 400 })
      }

      const { data: activeMembers } = await admin
        .from("members")
        .select("id, nickname")
        .eq("guild_id", guildId)
        .eq("status", "활동")

      if (!activeMembers?.length) {
        return NextResponse.json({ ok: false, message: "활동 혈원이 없습니다." }, { status: 400 })
      }

      const { data: due, error } = await admin
        .from("dues")
        .insert({
          guild_id: guildId,
          dues_month: yearMonth,
          amount_per_member: amountPerMember,
          due_date: dueDate,
          memo: body.memo?.trim() ?? `${formatYearMonthLabel(yearMonth)} 혈비`,
          created_by: actorId,
        })
        .select("id")
        .single()

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ ok: false, message: "해당 월 혈비가 이미 존재합니다." }, { status: 409 })
        }
        return NextResponse.json({ ok: false, message: "혈비 부과에 실패했습니다." }, { status: 500 })
      }

      const dueMembers = activeMembers.map((m: { id: string }) => ({
        due_id: due.id,
        member_id: m.id,
        amount: amountPerMember,
        status: "unpaid" as const,
      }))

      const { error: membersError } = await admin.from("due_members").insert(dueMembers)
      if (membersError) {
        return NextResponse.json({ ok: false, message: "혈비 대상 등록에 실패했습니다." }, { status: 500 })
      }

      return NextResponse.json({ ok: true, message: "혈비가 부과되었습니다.", billId: due.id })
    }

    if (body.action === "set_payment_status") {
      const roleCheck = requireManagerOrAdmin(authResult.member)
      if (!roleCheck.ok) {
        return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
      }

      const billId = body.billId
      const memberId = body.memberId
      const status = body.status
      if (!billId || !memberId || !status) {
        return NextResponse.json({ ok: false, message: "billId, memberId, status가 필요합니다." }, { status: 400 })
      }

      const dueCheck = await requireDueInActorGuild(admin, guildId, billId)
      if (!dueCheck.ok) {
        return NextResponse.json({ ok: false, message: dueCheck.message }, { status: dueCheck.status })
      }

      const memberCheck = await requireMemberInActorGuild(admin, guildId, memberId)
      if (!memberCheck.ok) {
        return NextResponse.json({ ok: false, message: memberCheck.message }, { status: memberCheck.status })
      }

      const { data: dueMember } = await admin
        .from("due_members")
        .select("*")
        .eq("due_id", billId)
        .eq("member_id", memberId)
        .maybeSingle()

      if (!dueMember) {
        return NextResponse.json({ ok: false, message: "해당 혈원은 이 혈비 대상이 아닙니다." }, { status: 404 })
      }

      const { data: due } = await admin
        .from("dues")
        .select("dues_month, amount_per_member")
        .eq("id", billId)
        .eq("guild_id", guildId)
        .maybeSingle()

      const oldStatus = dueMember.status as string
      const newDbStatus = uiDuesStatusToDb(status)
      if (oldStatus === newDbStatus) {
        return NextResponse.json({ ok: true, message: "변경 사항이 없습니다." })
      }

      const { data: member } = await admin
        .from("members")
        .select("nickname")
        .eq("id", memberId)
        .eq("guild_id", guildId)
        .maybeSingle()

      const ledgerSourceId = `${billId}:${memberId}`

      if (newDbStatus === "paid" && oldStatus !== "paid") {
        await upsertLedgerEntry(admin, guildId, {
          transactionDate: getTodayDateString(),
          entryType: "income",
          sourceType: "dues",
          sourceId: ledgerSourceId,
          amount: Number(dueMember.amount),
          description: `${member?.nickname ?? "혈원"} ${due?.dues_month ?? ""} 혈비`,
        })
      } else if (oldStatus === "paid" && newDbStatus !== "paid") {
        await cancelLedgerBySource(admin, guildId, "dues", ledgerSourceId)
      }

      await admin
        .from("due_members")
        .update({
          status: newDbStatus,
          paid_at: newDbStatus === "paid" ? new Date().toISOString() : null,
          confirmed_by: newDbStatus === "paid" ? actorId : null,
        })
        .eq("id", dueMember.id)

      await admin.from("due_change_logs").insert({
        due_id: billId,
        member_id: memberId,
        old_status: oldStatus,
        new_status: newDbStatus,
        memo: body.changeMemo ?? "",
        created_by: actorId,
      })

      return NextResponse.json({ ok: true, message: "혈비 상태가 변경되었습니다." })
    }

    return NextResponse.json({ ok: false, message: "알 수 없는 action입니다." }, { status: 400 })
  } catch (error) {
    console.error("[dues/mutate]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "혈비 처리 중 오류가 발생했습니다.") },
      { status: 500 },
    )
  }
}
