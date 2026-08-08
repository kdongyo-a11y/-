import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import {
  defaultSiegeDateRange,
  fetchSiegeOperationalData,
} from "@/lib/supabase/operational-data"
import { getTodayDateString } from "@/lib/boss-time-slots"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const url = new URL(request.url)
    const today = getTodayDateString()
    const defaults = defaultSiegeDateRange(today)
    const from = url.searchParams.get("from") ?? defaults.from
    const to = url.searchParams.get("to") ?? defaults.to

    const data = await fetchSiegeOperationalData(supabase, from, to)

    return NextResponse.json({ ok: true, ...data })
  } catch (error) {
    console.error("[siege/events GET]", error)
    return NextResponse.json(
      { ok: false, message: "공성 기록을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
