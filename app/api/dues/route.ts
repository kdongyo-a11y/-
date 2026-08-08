import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { fetchDuesOperationalData } from "@/lib/supabase/finance-data"
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

    const data = await fetchDuesOperationalData(supabase)
    return NextResponse.json({ ok: true, ...data })
  } catch (error) {
    console.error("[dues GET]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "혈비 기록을 불러오지 못했습니다.") },
      { status: 500 },
    )
  }
}
