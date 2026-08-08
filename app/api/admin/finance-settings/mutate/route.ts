import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { updateOpeningBalanceOnServer } from "@/lib/supabase/admin-settings-data"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

type Body = {
  action?: "update_opening_balance"
  openingBalance?: number
  reason?: string
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

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const body = (await request.json()) as Body
    if (body.action !== "update_opening_balance") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await updateOpeningBalanceOnServer(
      admin,
      authResult.member.id,
      actorGuildId(authResult.member),
      Number(body.openingBalance),
      body.reason ?? "",
    )

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "기초 혈맹자금이 저장되었습니다.",
      openingBalance: result.openingBalance,
    })
  } catch (error) {
    console.error("[admin/finance-settings/mutate]", error)
    return NextResponse.json(
      { ok: false, message: "기초 혈맹자금 저장 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
