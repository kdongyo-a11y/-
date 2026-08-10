import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { getSettlementDbId } from "@/lib/supabase/settlement-data"
import {
  updateSettlementRevenueItemAmounts,
  updateSettlementRevenueItemsMetadata,
} from "@/lib/supabase/settlement-revenue-item-data"
import type { SettlementRevenueItemUpdateInput } from "@/lib/settlement-revenue-item-types"
import type { SettlementSourceType } from "@/lib/settlement-types"
import { errorToMessage } from "@/lib/supabase/db-errors"

type Body = {
  action?: "update_metadata" | "update_amounts" | "update_items"
  sourceType?: SettlementSourceType
  sourceId?: string
  updates?: SettlementRevenueItemUpdateInput[]
  amountItems?: Array<{ id: string; amount: number }>
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
    const action = body.action ?? "update_items"
    if (
      action !== "update_metadata" &&
      action !== "update_amounts" &&
      action !== "update_items"
    ) {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    if (!body.sourceType || !body.sourceId) {
      return NextResponse.json({ ok: false, message: "정산 정보가 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    const settlementDbId = await getSettlementDbId(admin, guildId, body.sourceType, body.sourceId)
    if (!settlementDbId) {
      return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
    }

    const { data: settlementRow, error: settlementError } = await admin
      .from("settlements")
      .select("id, total_income, guild_id")
      .eq("id", settlementDbId)
      .eq("guild_id", guildId)
      .maybeSingle()

    if (settlementError) throw settlementError
    if (!settlementRow) {
      return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
    }

    const totalIncome = Number(settlementRow.total_income)

    let result:
      | { ok: true; items: import("@/lib/settlement-revenue-item-types").SettlementRevenueItem[] }
      | { ok: false; message: string }

    if (action === "update_amounts" || (action === "update_items" && body.amountItems?.length)) {
      const amountItems = body.amountItems ?? body.updates?.map((u) => ({ id: u.id, amount: u.amount! }))
      if (!amountItems?.length) {
        return NextResponse.json({ ok: false, message: "금액 배치 데이터가 필요합니다." }, { status: 400 })
      }
      result = await updateSettlementRevenueItemAmounts(
        admin,
        guildId,
        settlementDbId,
        totalIncome,
        amountItems,
      )
    } else {
      if (!body.updates?.length) {
        return NextResponse.json({ ok: false, message: "수정할 항목이 필요합니다." }, { status: 400 })
      }
      result = await updateSettlementRevenueItemsMetadata(admin, guildId, settlementDbId, body.updates)
    }

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "수익 항목이 수정되었습니다.",
      items: result.items,
    })
  } catch (error) {
    console.error("[finance/revenue-items/mutate POST]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "수익 항목 수정 중 오류가 발생했습니다.") },
      { status: 500 },
    )
  }
}
