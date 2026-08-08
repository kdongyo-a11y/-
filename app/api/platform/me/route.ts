import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePlatformAdminFromClient } from "@/lib/platform/platform-admin-auth"

/** Platform admin 여부 확인 (UI gate) */
export async function GET() {
  try {
    const supabase = await createClient()
    const ctx = await requirePlatformAdminFromClient(supabase)
    if (!ctx.ok) {
      return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
    }

    return NextResponse.json({
      ok: true,
      displayName: ctx.platformAdmin.display_name,
    })
  } catch (error) {
    console.error("[platform/me GET]", error)
    return NextResponse.json(
      { ok: false, message: "권한 확인에 실패했습니다." },
      { status: 500 },
    )
  }
}
