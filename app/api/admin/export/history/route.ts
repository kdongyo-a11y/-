import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdminDataContext } from "@/lib/admin-data/admin-data-auth"
import { fetchExportLogs } from "@/lib/supabase/export-log-data"

export async function GET() {
  try {
    const supabase = await createClient()
    const ctx = await requireAdminDataContext(supabase)
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
    }

    const admin = createAdminClient()
    const logs = await fetchExportLogs(admin, ctx.guildId, 30)

    return NextResponse.json({ ok: true, logs })
  } catch (error) {
    console.error("[admin/export/history GET]", error)
    return NextResponse.json(
      { ok: false, message: "내보내기 이력을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
