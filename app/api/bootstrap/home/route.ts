import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { fetchHomeBootstrapData } from "@/lib/supabase/home-bootstrap-data"
import { errorToMessage } from "@/lib/supabase/db-errors"
import { PerfTimer } from "@/lib/perf-log"

export async function GET() {
  const perf = new PerfTimer("home-bootstrap")
  try {
    const supabase = await createClient()
    const authResult = await perf.measure("authMs", () => requireAuthenticatedMember(supabase))
    perf.addDbCalls(2)

    if ("error" in authResult) {
      perf.finish({ ok: false })
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const admin = createAdminClient()
    const bootstrap = await perf.measure("dbMs", () =>
      fetchHomeBootstrapData(supabase, admin, authResult.member),
    )
    perf.addDbCalls(18)

    const body = JSON.stringify({ ok: true, bootstrap })
    perf.finish({ ok: true, payloadBytes: body.length })

    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[bootstrap/home GET]", error)
    perf.finish({ ok: false, reason: "error" })
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "홈 데이터를 불러오지 못했습니다.") },
      { status: 500 },
    )
  }
}
