import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { validatePasswordChange } from "@/lib/auth-utils"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      newPassword?: string
      confirmPassword?: string
    }
    const newPassword = body.newPassword ?? ""
    const confirmPassword = body.confirmPassword ?? ""

    const validation = validatePasswordChange({ newPassword, confirmPassword })
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

    const { error: updateAuthError } = await supabase.auth.updateUser({
      password: newPassword,
    })
    if (updateAuthError) {
      console.error("[auth/change-password]", updateAuthError)
      return NextResponse.json(
        { ok: false, message: "비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요." },
        { status: 500 },
      )
    }

    const { error: updateMemberError } = await createAdminClient()
      .from("members")
      .update({ must_change_password: false })
      .eq("id", authResult.member.id)
      .eq("auth_user_id", authResult.member.auth_user_id)

    if (updateMemberError) {
      return NextResponse.json(
        { ok: false, message: "계정 상태 업데이트에 실패했습니다." },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, message: "비밀번호가 변경되었습니다." })
  } catch (error) {
    console.error("[auth/change-password]", error)
    return NextResponse.json(
      { ok: false, message: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    )
  }
}
