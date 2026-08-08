import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { fetchGuildProfile, toGuildProfileState } from "@/lib/supabase/guild-profile-data"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)

    if ("error" in authResult) {
      return NextResponse.json(
        {
          ok: true,
          authenticated: false,
          guildName: "",
          serverId: "",
          serverName: "",
          guildMarkUrl: null,
          guildMarkPath: null,
          updatedAt: null,
        },
        { headers: { "Cache-Control": "no-store, max-age=0" } },
      )
    }

    const admin = createAdminClient()
    const profile = await fetchGuildProfile(admin, authResult.member.guild_id)

    if (!profile) {
      return NextResponse.json(
        { ok: false, message: "혈맹 정보를 찾을 수 없습니다." },
        { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
      )
    }

    const state = toGuildProfileState(profile)

    return NextResponse.json(
      {
        ok: true,
        authenticated: true,
        ...state,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  } catch (error) {
    console.error("[guild-profile/GET]", error)
    return NextResponse.json(
      { ok: false, message: "혈맹 기본정보를 불러오지 못했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    )
  }
}
