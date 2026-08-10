import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import { updateGuildOperationSettingsOnServer } from "@/lib/supabase/operation-settings-data"
import { isValidPolicyAmountMode } from "@/lib/operation-settings-utils"
import type { PolicyAmountMode } from "@/lib/operation-settings-types"

type Body = {
  action?: "update_settings"
  managementFeeMode?: PolicyAmountMode
  managementFeePercentage?: number | null
  reserveMode?: PolicyAmountMode
  reservePercentage?: number | null
  allocations?: Array<{ memberId: string; ratioBp: number }>
  reason?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const body = (await request.json()) as Body
    if (body.action !== "update_settings") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    if (!isValidPolicyAmountMode(body.managementFeeMode) || !isValidPolicyAmountMode(body.reserveMode)) {
      return NextResponse.json({ ok: false, message: "산정 방식이 올바르지 않습니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await updateGuildOperationSettingsOnServer(
      admin,
      authResult.member.id,
      actorGuildId(authResult.member),
      {
        managementFeeMode: body.managementFeeMode!,
        managementFeePercentage:
          body.managementFeePercentage != null ? Number(body.managementFeePercentage) : null,
        reserveMode: body.reserveMode!,
        reservePercentage: body.reservePercentage != null ? Number(body.reservePercentage) : null,
        allocations: (body.allocations ?? []).map((a) => ({
          memberId: a.memberId,
          ratioBp: Number(a.ratioBp),
        })),
        reason: body.reason ?? "",
      },
    )

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "운영 정책이 저장되었습니다.",
      settings: result.settings,
    })
  } catch (error) {
    console.error("[admin/operation-settings/mutate]", error)
    return NextResponse.json(
      { ok: false, message: "운영 정책 저장 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
