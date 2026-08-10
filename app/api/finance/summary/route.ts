import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { fetchFinanceSummaryForGuild } from "@/lib/supabase/finance-summary-data"
import { errorToMessage } from "@/lib/supabase/db-errors"

export async function GET() {
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

    const guildId = actorGuildId(authResult.member)
    const summary = await fetchFinanceSummaryForGuild(supabase, guildId)
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    console.error("[finance/summary GET]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "재정 현황을 불러오지 못했습니다.") },
      { status: 500 },
    )
  }
}
