import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST() {
  try {
    const supabase = await createClient()
    const { error } = await supabase.auth.signOut()
    if (error) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[auth/logout]", error)
    return NextResponse.json(
      { ok: false, message: "로그아웃 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
