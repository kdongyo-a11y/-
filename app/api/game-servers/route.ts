import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchActiveGameServersWithStatus } from "@/lib/supabase/game-server-data"

export const dynamic = "force-dynamic"

/** active game_servers 목록 — 로그인/혈맹 생성 전 public read */
export async function GET() {
  try {
    const admin = createAdminClient()
    const result = await fetchActiveGameServersWithStatus(admin)

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: result.message,
          reason: result.reason,
        },
        { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
      )
    }

    return NextResponse.json(
      { ok: true, servers: result.servers },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (error) {
    console.error("[game-servers/GET]", error)
    return NextResponse.json(
      { ok: false, message: "서버 목록을 불러오지 못했습니다.", reason: "query_error" },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }
}
