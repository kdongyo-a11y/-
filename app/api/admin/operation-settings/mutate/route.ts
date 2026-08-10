import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  cancelScheduledPolicyVersionOnServer,
  createGuildOperationPolicyVersionOnServer,
} from "@/lib/supabase/operation-settings-data"
import { isValidPolicyAmountMode } from "@/lib/operation-settings-utils"
import {
  effectiveFromNowIso,
  kstLocalDateTimeToIso,
} from "@/lib/operation-policy-kst-utils"
import type { PolicyAmountMode } from "@/lib/operation-settings-types"

type Body = {
  action?: "create_version" | "cancel_scheduled_version"
  managementFeeMode?: PolicyAmountMode
  managementFeePercentage?: number | null
  reserveMode?: PolicyAmountMode
  reservePercentage?: number | null
  allocations?: Array<{ memberId: string; ratioBp: number }>
  changeReason?: string
  effectiveFromMode?: "now" | "scheduled"
  effectiveFromDate?: string
  effectiveFromTime?: string
  versionId?: string
  cancelReason?: string
}

function resolveEffectiveFromIso(body: Body): { ok: true; iso: string } | { ok: false; message: string } {
  if (body.effectiveFromMode === "scheduled") {
    if (!body.effectiveFromDate || !body.effectiveFromTime) {
      return { ok: false, message: "시행 날짜와 시간을 입력해주세요." }
    }
    try {
      return { ok: true, iso: kstLocalDateTimeToIso(body.effectiveFromDate, body.effectiveFromTime) }
    } catch {
      return { ok: false, message: "시행 날짜/시간 형식이 올바르지 않습니다." }
    }
  }
  return { ok: true, iso: effectiveFromNowIso() }
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
    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)

    if (body.action === "cancel_scheduled_version") {
      if (!body.versionId) {
        return NextResponse.json({ ok: false, message: "versionId가 필요합니다." }, { status: 400 })
      }
      const result = await cancelScheduledPolicyVersionOnServer(
        admin,
        authResult.member.id,
        guildId,
        body.versionId,
        body.cancelReason ?? "",
      )
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
      }
      return NextResponse.json({
        ok: true,
        message: "예약 정책이 취소되었습니다.",
        policyView: result.view,
      })
    }

    if (body.action !== "create_version") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    if (!isValidPolicyAmountMode(body.managementFeeMode) || !isValidPolicyAmountMode(body.reserveMode)) {
      return NextResponse.json({ ok: false, message: "산정 방식이 올바르지 않습니다." }, { status: 400 })
    }

    const effectiveFrom = resolveEffectiveFromIso(body)
    if (!effectiveFrom.ok) {
      return NextResponse.json({ ok: false, message: effectiveFrom.message }, { status: 400 })
    }

    const result = await createGuildOperationPolicyVersionOnServer(
      admin,
      authResult.member.id,
      guildId,
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
        changeReason: body.changeReason ?? "",
        effectiveFromIso: effectiveFrom.iso,
      },
    )

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      message: "운영 정책 version이 등록되었습니다.",
      policyView: result.view,
      version: result.version,
    })
  } catch (error) {
    console.error("[admin/operation-settings/mutate]", error)
    return NextResponse.json(
      { ok: false, message: "운영 정책 저장 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
