import type { SupabaseClient } from "@supabase/supabase-js"
import {
  mapContributionScoreRow,
  type ContributionScoreSetting,
} from "@/lib/contribution-score-settings"

export type GuildFinanceSettingLog = {
  id: string
  previousOpeningBalance: number
  newOpeningBalance: number
  reason: string
  createdBy: string | null
  createdAt: string
}

function mapFinanceLogRow(row: {
  id: string
  previous_opening_balance: number | string
  new_opening_balance: number | string
  reason: string
  created_by: string | null
  created_at: string
}): GuildFinanceSettingLog {
  return {
    id: row.id,
    previousOpeningBalance: Number(row.previous_opening_balance),
    newOpeningBalance: Number(row.new_opening_balance),
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

export async function fetchOpeningBalance(
  admin: SupabaseClient,
  guildId: string,
): Promise<number> {
  const { data } = await admin
    .from("guild_finance_settings")
    .select("opening_balance")
    .eq("guild_id", guildId)
    .maybeSingle()

  return Number(data?.opening_balance ?? 0)
}

export async function fetchGuildFinanceSettingLogs(
  admin: SupabaseClient,
  guildId: string,
  limit = 50,
): Promise<GuildFinanceSettingLog[]> {
  const { data, error } = await admin
    .from("guild_finance_setting_logs")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[fetchGuildFinanceSettingLogs]", error)
    return []
  }

  return (data ?? []).map(mapFinanceLogRow)
}

export async function updateOpeningBalanceOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  newBalance: number,
  reason: string,
): Promise<{ ok: true; openingBalance: number } | { ok: false; message: string }> {
  if (!Number.isFinite(newBalance) || newBalance < 0) {
    return { ok: false, message: "기초 혈맹자금은 0 이상이어야 합니다." }
  }
  if (!reason.trim()) {
    return { ok: false, message: "변경 사유를 입력해주세요." }
  }

  const previous = await fetchOpeningBalance(admin, guildId)

  const { error: updateError } = await admin
    .from("guild_finance_settings")
    .upsert({
      guild_id: guildId,
      opening_balance: Math.round(newBalance),
      updated_at: new Date().toISOString(),
    })

  if (updateError) {
    console.error("[updateOpeningBalanceOnServer]", updateError)
    return { ok: false, message: "기초 혈맹자금 저장에 실패했습니다." }
  }

  const { error: logError } = await admin.from("guild_finance_setting_logs").insert({
    guild_id: guildId,
    previous_opening_balance: previous,
    new_opening_balance: Math.round(newBalance),
    reason: reason.trim(),
    created_by: actorId,
  })

  if (logError) {
    console.error("[updateOpeningBalanceOnServer/log]", logError)
  }

  return { ok: true, openingBalance: Math.round(newBalance) }
}

export async function fetchContributionScoreSettings(
  admin: SupabaseClient,
  guildId: string,
): Promise<ContributionScoreSetting[]> {
  const { data, error } = await admin
    .from("contribution_score_settings")
    .select("*")
    .eq("guild_id", guildId)
    .order("effective_from", { ascending: true })

  if (error) {
    console.error("[fetchContributionScoreSettings]", error)
    return []
  }

  return (data ?? []).map(mapContributionScoreRow)
}

export async function createContributionScoreSettingOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  input: {
    generalBossScore: number
    mainBossScore: number
    siegeScore: number
    effectiveFrom: string
  },
): Promise<{ ok: true; setting: ContributionScoreSetting } | { ok: false; message: string }> {
  const { data, error } = await admin
    .from("contribution_score_settings")
    .insert({
      guild_id: guildId,
      general_boss_score: input.generalBossScore,
      main_boss_score: input.mainBossScore,
      siege_score: input.siegeScore,
      effective_from: input.effectiveFrom,
      created_by: actorId,
    })
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { ok: false, message: "동일한 적용 시작일 설정이 이미 존재합니다." }
    }
    console.error("[createContributionScoreSettingOnServer]", error)
    return { ok: false, message: "기여도 점수 설정 저장에 실패했습니다." }
  }

  return { ok: true, setting: mapContributionScoreRow(data) }
}
