import type { SupabaseClient } from "@supabase/supabase-js"
import { rowToGuild, type GuildRow } from "@/lib/guild-types"

export type OnboardingStatus = {
  onboardingCompleted: boolean
  onboardingCompletedAt: string | null
  guildCode: string
  guildName: string
}

export async function fetchOnboardingStatus(
  admin: SupabaseClient,
  guildId: string,
): Promise<OnboardingStatus | null> {
  const { data, error } = await admin
    .from("guilds")
    .select("guild_code, guild_name, onboarding_completed, onboarding_completed_at")
    .eq("id", guildId)
    .maybeSingle()

  if (error || !data) return null

  const row = data as GuildRow
  return {
    onboardingCompleted: row.onboarding_completed ?? false,
    onboardingCompletedAt: row.onboarding_completed_at ?? null,
    guildCode: row.guild_code,
    guildName: row.guild_name,
  }
}

export async function completeOnboardingOnServer(
  admin: SupabaseClient,
  guildId: string,
): Promise<{ ok: true; guild: ReturnType<typeof rowToGuild> } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("guilds")
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", guildId)
    .select("*")
    .single()

  if (error || !data) {
    console.error("[completeOnboardingOnServer]", error)
    return { ok: false, message: "온보딩 완료 처리에 실패했습니다." }
  }

  return { ok: true, guild: rowToGuild(data as GuildRow) }
}
