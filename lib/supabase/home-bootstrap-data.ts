import type { SupabaseClient } from "@supabase/supabase-js"
import type { HomeBootstrapPayload } from "@/lib/home-bootstrap-types"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { fetchContributionScoreSettings } from "@/lib/supabase/admin-settings-data"
import { fetchDuesOperationalData } from "@/lib/supabase/finance-data"
import { fetchHomeNoticesPreview } from "@/lib/supabase/notices-data"
import { fetchMemberOperationPolicyPublicView } from "@/lib/supabase/operation-settings-data"
import {
  fetchBossOperationalData,
  fetchSiegeHomeOperationalData,
  homeBossDateRange,
} from "@/lib/supabase/operational-data"
import { fetchMemberSettlementHomeData } from "@/lib/supabase/settlement-home-data"
import type { MemberRow } from "@/lib/supabase/member-mapper"
import type { RosterMember } from "@/lib/member-types"

export async function fetchMembersRosterSummary(
  supabase: SupabaseClient,
  guildId: string,
): Promise<RosterMember[]> {
  const { data, error } = await supabase
    .from("members")
    .select("id, nickname, status")
    .eq("guild_id", guildId)
    .eq("status", "활동")
    .order("nickname")

  if (error) throw error
  return (data ?? []).map((m: { id: string; nickname: string }) => ({
    id: m.id,
    nickname: m.nickname,
  }))
}

export async function fetchHomeBootstrapData(
  supabase: SupabaseClient,
  admin: SupabaseClient,
  member: MemberRow,
  today = getTodayDateString(),
): Promise<HomeBootstrapPayload> {
  const guildId = member.guild_id
  const bossRange = homeBossDateRange(today)

  const [
    policyView,
    noticesPreview,
    bossData,
    siegeData,
    duesData,
    contributionSettings,
    membersRoster,
    settlementHome,
  ] = await Promise.all([
    fetchMemberOperationPolicyPublicView(admin, guildId),
    fetchHomeNoticesPreview(admin, guildId),
    fetchBossOperationalData(supabase, bossRange.from, bossRange.to, guildId),
    fetchSiegeHomeOperationalData(supabase, guildId, today),
    fetchDuesOperationalData(supabase),
    fetchContributionScoreSettings(admin, guildId),
    fetchMembersRosterSummary(supabase, guildId),
    fetchMemberSettlementHomeData(supabase, guildId, member.id),
  ])

  return {
    policyView,
    noticesPreview,
    boss: {
      checks: bossData.checks,
      slotAdminFlags: bossData.slotAdminFlags,
    },
    siege: {
      sieges: siegeData.sieges,
    },
    dues: {
      bills: duesData.bills,
    },
    contributionSettings,
    membersRoster,
    settlementHome,
  }
}
