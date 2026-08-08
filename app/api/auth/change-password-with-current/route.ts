import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { validatePasswordChange } from "@/lib/auth-utils"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
    }
    const currentPassword = body.currentPassword ?? ""
    const newPassword = body.newPassword ?? ""
    const confirmPassword = body.confirmPassword ?? ""

    const validation = validatePasswordChange({
      newPassword,
      confirmPassword,
      currentPassword,
    })
    if (!validation.ok) {
      return NextResponse.json(
        { ok: false, message: validation.message },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.email) {
      return NextResponse.json(
        { ok: false, message: "로그인 세션을 확인할 수 없습니다. 다시 로그인해주세요." },
        { status: 401 },
      )
    }

    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (verifyError) {
      const isCredentialError =
        verifyError.message.toLowerCase().includes("invalid login credentials") ||
        verifyError.status === 400
      return NextResponse.json(
        {
          ok: false,
          message: isCredentialError
            ? "현재 비밀번호가 올바르지 않습니다."
            : "비밀번호 확인 중 오류가 발생했습니다.",
        },
        { status: 401 },
      )
    }

    const { error: updateAuthError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateAuthError) {
      console.error("[auth/change-password-with-current]", updateAuthError)
      return NextResponse.json(
        { ok: false, message: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, message: "비밀번호가 변경되었습니다." })
  } catch (error) {
    console.error("[auth/change-password-with-current]", error)
    return NextResponse.json(
      { ok: false, message: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    )
  }
}
