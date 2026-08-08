import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { fetchPlatformAdminByAuthUserId } from "@/lib/platform/platform-admin-auth"

type LoginBody = {
  email?: string
  password?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody
    const email = body.email?.trim() ?? ""
    const password = body.password ?? ""

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, message: "이메일과 비밀번호를 입력해주세요." },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError || !authData.user) {
      return NextResponse.json(
        { ok: false, message: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 },
      )
    }

    const admin = createAdminClient()
    const platformAdmin = await fetchPlatformAdminByAuthUserId(admin, authData.user.id)

    if (!platformAdmin) {
      await supabase.auth.signOut()
      return NextResponse.json(
        { ok: false, message: "플랫폼 운영자 권한이 없습니다." },
        { status: 403 },
      )
    }

    return NextResponse.json({
      ok: true,
      displayName: platformAdmin.display_name,
    })
  } catch (error) {
    console.error("[platform/login POST]", error)
    return NextResponse.json(
      { ok: false, message: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
