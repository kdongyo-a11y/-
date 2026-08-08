import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import {
  fetchGuildFinanceSettingLogs,
  fetchOpeningBalance,
} from "@/lib/supabase/admin-settings-data"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

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

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const [openingBalance, logs] = await Promise.all([
      fetchOpeningBalance(admin, guildId),
      fetchGuildFinanceSettingLogs(admin, guildId),
    ])

    return NextResponse.json({ ok: true, openingBalance, logs })
  } catch (error) {
    console.error("[admin/finance-settings GET]", error)
    return NextResponse.json(
      { ok: false, message: "기초 혈맹자금 정보를 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
