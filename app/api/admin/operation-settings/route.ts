import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  fetchActiveGuildMembers,
  fetchGuildOperationPolicyView,
} from "@/lib/supabase/operation-settings-data"

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const url = new URL(request.url)
    const occurredAt = url.searchParams.get("occurredAt") ?? undefined
    const isAdmin = authResult.member.role === "admin"

    const [policyView, activeMembers] = await Promise.all([
      fetchGuildOperationPolicyView(admin, guildId, occurredAt),
      isAdmin ? fetchActiveGuildMembers(admin, guildId) : Promise.resolve([]),
    ])

    return NextResponse.json({
      ok: true,
      policyView,
      settings: policyView.settings,
      activeMembers: isAdmin ? activeMembers : undefined,
      canEdit: isAdmin,
    })
  } catch (error) {
    console.error("[admin/operation-settings GET]", error)
    return NextResponse.json(
      { ok: false, message: "운영 정책을 불러오지 못했습니다." },
      { status: 500 },
    )
  }
}
