import type { SupabaseClient } from "@supabase/supabase-js"
import type { MemberRow } from "@/lib/supabase/member-mapper"

export type GuildScopeError = { ok: false; message: string; status: number }

export function actorGuildId(member: MemberRow): string {
  return member.guild_id
}

/** Service Role API: target member가 actor와 동일 guild인지 검증 */
export async function requireMemberInActorGuild(
  admin: SupabaseClient,
  actorGuildId: string,
  targetMemberId: string,
): Promise<{ ok: true } | GuildScopeError> {
  const { data, error } = await admin
    .from("members")
    .select("id, guild_id")
    .eq("id", targetMemberId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: "혈맹원을 찾을 수 없습니다.", status: 404 }
  }

  if (data.guild_id !== actorGuildId) {
    return { ok: false, message: "다른 혈맹의 혈맹원입니다.", status: 403 }
  }

  return { ok: true }
}

/** boss_events / siege_events row가 actor guild 소속인지 */
export function isResourceInActorGuild(
  resource: { guild_id: string } | null | undefined,
  actorGuildId: string,
): resource is { guild_id: string } {
  return resource != null && resource.guild_id === actorGuildId
}

export async function requireDueInActorGuild(
  admin: SupabaseClient,
  actorGuildId: string,
  dueId: string,
): Promise<{ ok: true; dueId: string } | GuildScopeError> {
  const { data, error } = await admin
    .from("dues")
    .select("id, guild_id")
    .eq("id", dueId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: "혈비를 찾을 수 없습니다.", status: 404 }
  }
  if (data.guild_id !== actorGuildId) {
    return { ok: false, message: "다른 혈맹의 혈비입니다.", status: 403 }
  }
  return { ok: true, dueId: data.id }
}

export async function requireExpenseInActorGuild(
  admin: SupabaseClient,
  actorGuildId: string,
  expenseId: string,
): Promise<{ ok: true; expenseId: string } | GuildScopeError> {
  const { data, error } = await admin
    .from("expenses")
    .select("id, guild_id, status")
    .eq("id", expenseId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, message: "지출을 찾을 수 없습니다.", status: 404 }
  }
  if (data.guild_id !== actorGuildId) {
    return { ok: false, message: "다른 혈맹의 지출입니다.", status: 403 }
  }
  return { ok: true, expenseId: data.id }
}

/** batch: 모든 target memberId가 actor guild 소속인지 검증 */
export async function requireMembersInActorGuild(
  admin: SupabaseClient,
  actorGuildId: string,
  targetMemberIds: string[],
): Promise<{ ok: true } | GuildScopeError> {
  const unique = [...new Set(targetMemberIds.filter(Boolean))]
  if (unique.length === 0) {
    return { ok: false, message: "참여자가 없습니다.", status: 400 }
  }

  const { data, error } = await admin
    .from("members")
    .select("id")
    .eq("guild_id", actorGuildId)
    .in("id", unique)

  if (error) {
    return { ok: false, message: "혈맹원을 찾을 수 없습니다.", status: 500 }
  }

  if ((data?.length ?? 0) !== unique.length) {
    return { ok: false, message: "다른 혈맹의 혈맹원이 포함되어 있습니다.", status: 403 }
  }

  return { ok: true }
}

/** 활동 상태 혈맹원만 — 운영 정책 관리비 수령 대상 검증 */
export async function requireActiveMembersInActorGuild(
  admin: SupabaseClient,
  actorGuildId: string,
  targetMemberIds: string[],
): Promise<{ ok: true } | GuildScopeError> {
  const unique = [...new Set(targetMemberIds.filter(Boolean))]
  if (unique.length === 0) {
    return { ok: false, message: "관리비 수령 대상을 선택해주세요.", status: 400 }
  }

  const { data, error } = await admin
    .from("members")
    .select("id, guild_id, status")
    .eq("guild_id", actorGuildId)
    .in("id", unique)

  if (error) {
    return { ok: false, message: "혈맹원을 찾을 수 없습니다.", status: 500 }
  }

  if ((data?.length ?? 0) !== unique.length) {
    return { ok: false, message: "다른 혈맹의 혈맹원이 포함되어 있습니다.", status: 403 }
  }

  const inactive = (data ?? []).find((m: { status: string }) => m.status !== "활동")
  if (inactive) {
    return {
      ok: false,
      message: "활동 상태 혈맹원만 관리비 수령 대상으로 지정할 수 있습니다.",
      status: 400,
    }
  }

  return { ok: true }
}
