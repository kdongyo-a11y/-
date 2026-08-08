import { NextResponse } from "next/server"

/** Phase 5.5 — 혈맹명 변경 비활성화 (server + guild_name이 identity) */
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "혈맹명은 변경할 수 없습니다." },
    { status: 403 },
  )
}
