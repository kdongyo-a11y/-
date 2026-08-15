import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import {
  defaultBossDateRange,
  fetchBossOperationalData,
  homeBossDateRange,
} from "@/lib/supabase/operational-data"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { errorToMessage } from "@/lib/supabase/db-errors"
import { PerfTimer } from "@/lib/perf-log"

export async function GET(request: Request) {
  const perf = new PerfTimer("boss-events")
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

    const url = new URL(request.url)
    const today = getTodayDateString()
    const scope = url.searchParams.get("scope") ?? "full"
    const defaults = scope === "home" ? homeBossDateRange(today) : defaultBossDateRange(today)
    const from = url.searchParams.get("from") ?? defaults.from
    const to = url.searchParams.get("to") ?? defaults.to
    const guildId = actorGuildId(authResult.member)

    const data = await perf.measure("dbMs", () =>
      fetchBossOperationalData(supabase, from, to, guildId),
    )
    perf.addDbCalls(4)

    const body = JSON.stringify({ ok: true, ...data, scope })
    perf.finish({ ok: true, scope, payloadBytes: body.length })

    return new NextResponse(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("[boss/events GET]", error)
    perf.finish({ ok: false, reason: "error" })
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "보스타임 기록을 불러오지 못했습니다.") },
      { status: 500 },
    )
  }
}
