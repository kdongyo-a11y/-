import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { errorToMessage } from "@/lib/supabase/db-errors"
import { cancelLedgerBySource, upsertLedgerEntry } from "@/lib/supabase/finance-data"
import { actorGuildId, requireExpenseInActorGuild } from "@/lib/supabase/guild-scope-helpers"
import type { CreateExpenseInput, UpdateExpenseInput } from "@/lib/expense-types"
import { recordUsageEventFromActor } from "@/lib/platform/usage-events"

type Body = {
  action?: string
  expenseId?: string
  input?: CreateExpenseInput | UpdateExpenseInput
  memo?: string
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
    if (!body.action) {
      return NextResponse.json({ ok: false, message: "action이 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const actorId = authResult.member.id
    const guildId = actorGuildId(authResult.member)

    switch (body.action) {
      case "add_expense": {
        const input = body.input as CreateExpenseInput
        if (!input || input.amount <= 0) {
          return NextResponse.json({ ok: false, message: "금액은 0보다 커야 합니다." }, { status: 400 })
        }
        if (!input.description?.trim()) {
          return NextResponse.json({ ok: false, message: "내용을 입력해주세요." }, { status: 400 })
        }

        const { data: expense, error } = await admin
          .from("expenses")
          .insert({
            guild_id: guildId,
            expense_date: input.expenseDate,
            expense_type: input.expenseType,
            amount: input.amount,
            target: input.target?.trim() ?? "",
            description: input.description.trim(),
            memo: input.memo?.trim() ?? "",
            created_by: actorId,
          })
          .select("id")
          .single()

        if (error) {
          console.error("[finance/mutate add_expense]", error)
          return NextResponse.json({ ok: false, message: "지출 등록에 실패했습니다." }, { status: 500 })
        }

        await upsertLedgerEntry(admin, guildId, {
          transactionDate: input.expenseDate,
          entryType: "expense",
          sourceType: "expense",
          sourceId: expense.id,
          amount: input.amount,
          description:
            input.description + (input.memo ? ` · ${input.memo}` : ""),
        })

        await admin.from("expense_change_logs").insert({
          expense_id: expense.id,
          memo: "지출 등록",
          created_by: actorId,
        })

        void recordUsageEventFromActor("expense_created", authResult.member, null, admin)

        return NextResponse.json({ ok: true, message: "지출이 등록되었습니다.", expenseId: expense.id })
      }

      case "update_expense": {
        const input = body.input as UpdateExpenseInput
        const expenseId = body.expenseId
        if (!expenseId) {
          return NextResponse.json({ ok: false, message: "expenseId가 필요합니다." }, { status: 400 })
        }

        const expenseCheck = await requireExpenseInActorGuild(admin, guildId, expenseId)
        if (!expenseCheck.ok) {
          return NextResponse.json(
            { ok: false, message: expenseCheck.message },
            { status: expenseCheck.status },
          )
        }

        const { data: existing } = await admin
          .from("expenses")
          .select("*")
          .eq("id", expenseId)
          .eq("guild_id", guildId)
          .maybeSingle()

        if (!existing || existing.status === "cancelled") {
          return NextResponse.json({ ok: false, message: "지출을 찾을 수 없습니다." }, { status: 404 })
        }

        const nextAmount = input.amount ?? existing.amount
        if (nextAmount <= 0) {
          return NextResponse.json({ ok: false, message: "금액은 0보다 커야 합니다." }, { status: 400 })
        }

        const { error } = await admin
          .from("expenses")
          .update({
            expense_date: input.expenseDate ?? existing.expense_date,
            expense_type: input.expenseType ?? existing.expense_type,
            amount: nextAmount,
            target: input.target ?? existing.target,
            description: input.description ?? existing.description,
            memo: input.memo ?? existing.memo,
          })
          .eq("id", expenseId)
          .eq("guild_id", guildId)

        if (error) {
          return NextResponse.json({ ok: false, message: "지출 수정에 실패했습니다." }, { status: 500 })
        }

        await upsertLedgerEntry(admin, guildId, {
          transactionDate: input.expenseDate ?? existing.expense_date,
          entryType: "expense",
          sourceType: "expense",
          sourceId: expenseId,
          amount: nextAmount,
          description:
            (input.description ?? existing.description) +
            ((input.memo ?? existing.memo) ? ` · ${input.memo ?? existing.memo}` : ""),
        })

        await admin.from("expense_change_logs").insert({
          expense_id: expenseId,
          memo: body.memo ?? "지출 수정",
          created_by: actorId,
        })

        return NextResponse.json({ ok: true, message: "지출이 수정되었습니다." })
      }

      case "cancel_expense": {
        const expenseId = body.expenseId
        if (!expenseId) {
          return NextResponse.json({ ok: false, message: "expenseId가 필요합니다." }, { status: 400 })
        }

        const expenseCheck = await requireExpenseInActorGuild(admin, guildId, expenseId)
        if (!expenseCheck.ok) {
          return NextResponse.json(
            { ok: false, message: expenseCheck.message },
            { status: expenseCheck.status },
          )
        }

        const { data: existing } = await admin
          .from("expenses")
          .select("id, status")
          .eq("id", expenseId)
          .eq("guild_id", guildId)
          .maybeSingle()

        if (!existing) {
          return NextResponse.json({ ok: false, message: "지출을 찾을 수 없습니다." }, { status: 404 })
        }
        if (existing.status === "cancelled") {
          return NextResponse.json({ ok: false, message: "이미 취소된 지출입니다." }, { status: 400 })
        }

        const { error: cancelError } = await admin
          .from("expenses")
          .update({ status: "cancelled" })
          .eq("id", expenseId)
          .eq("guild_id", guildId)

        if (cancelError) {
          console.error("[finance/mutate cancel_expense update]", cancelError)
          return NextResponse.json({ ok: false, message: "지출 취소에 실패했습니다." }, { status: 500 })
        }

        try {
          await cancelLedgerBySource(admin, guildId, "expense", expenseId)
        } catch (ledgerError) {
          console.error("[finance/mutate cancel_expense ledger]", ledgerError)
          await admin.from("expenses").update({ status: "active" }).eq("id", expenseId).eq("guild_id", guildId)
          return NextResponse.json(
            { ok: false, message: "장부 반영에 실패했습니다. 지출 취소를 되돌렸습니다." },
            { status: 500 },
          )
        }

        const { error: logError } = await admin.from("expense_change_logs").insert({
          expense_id: expenseId,
          memo: body.memo ?? "지출 취소",
          created_by: actorId,
        })

        if (logError) {
          console.error("[finance/mutate cancel_expense log]", logError)
        }

        return NextResponse.json({ ok: true, message: "지출이 취소되었습니다." })
      }

      default:
        return NextResponse.json({ ok: false, message: "알 수 없는 action입니다." }, { status: 400 })
    }
  } catch (error) {
    console.error("[finance/mutate]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "재정 처리 중 오류가 발생했습니다.") },
      { status: 500 },
    )
  }
}
