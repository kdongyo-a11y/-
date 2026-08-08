import type { SupabaseClient } from "@supabase/supabase-js"
import type { MemberRow } from "@/lib/supabase/member-mapper"
import type { MemberAccountStatus, MemberStatus } from "@/lib/member-types"
import { normalizeGuildName } from "@/lib/guild-types"
import { isActiveGameServer } from "@/lib/supabase/game-server-data"

export function resolveLoginBlockMessage(
  accountStatus: MemberAccountStatus,
  status: MemberStatus,
): string | null {
  if (accountStatus === "inactive") {
    return "아직 활성화되지 않은 계정입니다."
  }
  if (accountStatus === "locked") {
    return "잠긴 계정입니다. 관리자에게 문의해주세요."
  }
  if (status === "휴면") {
    return "휴면 상태로 로그인할 수 없습니다."
  }
  if (status === "탈퇴") {
    return "탈퇴한 혈맹원은 로그인할 수 없습니다."
  }
  return null
}

export async function fetchMemberByAuthUserId(
  supabase: SupabaseClient,
  authUserId: string,
): Promise<MemberRow | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("auth_user_id", authUserId)
    .maybeSingle()

  if (error || !data) return null
  return data as MemberRow
}

export async function fetchMemberByServerGuildNameAndNickname(
  supabase: SupabaseClient,
  serverId: string,
  guildName: string,
  nickname: string,
): Promise<MemberRow | null> {
  if (!serverId) return null

  const serverActive = await isActiveGameServer(supabase, serverId)
  if (!serverActive) return null

  const normalizedName = normalizeGuildName(guildName)
  const trimmedNickname = nickname.trim()

  const { data: guild, error: guildError } = await supabase
    .from("guilds")
    .select("id, status")
    .eq("server_id", serverId)
    .eq("guild_name", normalizedName)
    .maybeSingle()

  if (guildError || !guild) return null
  if (guild.status !== "active") return null

  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("guild_id", guild.id)
    .eq("nickname", trimmedNickname)
    .maybeSingle()

  if (error || !data) return null
  return data as MemberRow
}

export async function requireAuthenticatedMember(
  supabase: SupabaseClient,
): Promise<{ member: MemberRow } | { error: string; status: number }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: "로그인이 필요합니다.", status: 401 }
  }

  const member = await fetchMemberByAuthUserId(supabase, user.id)
  if (!member) {
    return { error: "혈맹원 정보를 찾을 수 없습니다.", status: 403 }
  }

  return { member }
}
