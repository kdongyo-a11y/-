import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { getSettlementDbId } from "@/lib/supabase/settlement-data"
import { confirmSettlementRevenueReceipt } from "@/lib/supabase/settlement-revenue-receipt-data"
import { isOnOrAfterCheckpointCutoff } from "@/lib/guild-cash-utils"
import { fetchLatestGuildCashCheckpoint } from "@/lib/supabase/guild-cash-data"
import { errorToMessage } from "@/lib/supabase/db-errors"
import type { SettlementSourceType } from "@/lib/settlement-types"

type Body = {
  action?: "confirm_receipt"
  sourceType?: SettlementSourceType
  sourceId?: string
  amount?: number
  receivedAt?: string
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
    if (body.action !== "confirm_receipt") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    if (!body.sourceType || !body.sourceId) {
      return NextResponse.json({ ok: false, message: "정산 정보가 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    const checkpoint = await fetchLatestGuildCashCheckpoint(supabase, guildId)
    if (!checkpoint) {
      return NextResponse.json(
        { ok: false, message: "실보유액 기준점(checkpoint)을 먼저 설정해주세요." },
        { status: 400 },
      )
    }

    const settlementDbId = await getSettlementDbId(admin, guildId, body.sourceType, body.sourceId)
    if (!settlementDbId) {
      return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
    }

    const { data: settlementRow, error: settlementError } = await admin
      .from("settlements")
      .select("id, total_income, display_title, created_at, guild_id")
      .eq("id", settlementDbId)
      .eq("guild_id", guildId)
      .maybeSingle()

    if (settlementError) throw settlementError
    if (!settlementRow) {
      return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
    }

    if (!isOnOrAfterCheckpointCutoff(settlementRow.created_at, checkpoint)) {
      return NextResponse.json(
        {
          ok: false,
          message: "기준점 이전 정산은 Finance 2.0 수익 입금 확인 대상이 아닙니다.",
        },
        { status: 400 },
      )
    }

    const result = await confirmSettlementRevenueReceipt(admin, guildId, authResult.member.id, {
      settlementId: settlementDbId,
      amount: Number(body.amount),
      receivedAt: body.receivedAt ?? new Date().toISOString(),
      memo: body.memo ?? "",
      totalIncome: Number(settlementRow.total_income),
      displayTitle: settlementRow.display_title,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "수익 입금이 확인되었습니다.",
      receipt: result.receipt,
    })
  } catch (error) {
    console.error("[finance/revenue-receipt POST]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "수익 입금 확인 중 오류가 발생했습니다.") },
      { status: 500 },
    )
  }
}
