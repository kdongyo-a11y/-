import type { SupabaseClient } from "@supabase/supabase-js"
import type { MemberRow } from "@/lib/supabase/member-mapper"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"

export type AdminDataContext =
  | { ok: true; member: MemberRow; guildId: string }
  | { ok: false; message: string; status: number }

export async function requireAdminDataContext(
  supabase: SupabaseClient,
): Promise<AdminDataContext> {
  const authResult = await requireAuthenticatedMember(supabase)
  if ("error" in authResult) {
    return { ok: false, message: authResult.error, status: authResult.status }
  }

  const adminCheck = requireAdmin(authResult.member)
  if (!adminCheck.ok) {
    return { ok: false, message: adminCheck.message, status: adminCheck.status }
  }

  return {
    ok: true,
    member: authResult.member,
    guildId: actorGuildId(authResult.member),
  }
}
