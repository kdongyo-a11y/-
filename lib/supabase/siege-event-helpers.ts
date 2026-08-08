import type { SupabaseClient } from "@supabase/supabase-js"

export type SiegeEventRow = {
  id: string
  guild_id: string
  event_date: string
  start_time: string
  end_time: string
  status: string
  survey_opened_at: string | null
  survey_closed_at: string | null
  attendance_confirmed_at: string | null
  income_status: string
  settlement_status: string
  settlement_source_key: string | null
  memo: string
  created_at: string
  updated_at: string
}

export function siegeIdToEventDate(siegeId: string): string {
  return siegeId.startsWith("siege-") ? siegeId.slice(6) : siegeId
}

export async function getSiegeByIdForGuild(
  admin: SupabaseClient,
  siegeId: string,
  guildId: string,
): Promise<SiegeEventRow | null> {
  const eventDate = siegeIdToEventDate(siegeId)
  const { data, error } = await admin
    .from("siege_events")
    .select("*")
    .eq("guild_id", guildId)
    .eq("event_date", eventDate)
    .maybeSingle()

  if (error || !data) return null
  return data as SiegeEventRow
}
