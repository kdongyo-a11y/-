import type { SupabaseClient } from "@supabase/supabase-js"
import { parseSlotId, type BossEventRow } from "@/lib/supabase/boss-mapper"

export async function getBossEventBySlotId(
  admin: SupabaseClient,
  slotId: string,
  guildId: string,
): Promise<BossEventRow | null> {
  const parsed = parseSlotId(slotId)
  if (!parsed) return null

  const { data, error } = await admin
    .from("boss_events")
    .select("*")
    .eq("guild_id", guildId)
    .eq("event_date", parsed.eventDate)
    .eq("slot_hour", parsed.slotHour)
    .maybeSingle()

  if (error || !data) return null
  return data as BossEventRow
}

export async function getBossEventByIdForGuild(
  admin: SupabaseClient,
  eventId: string,
  guildId: string,
): Promise<BossEventRow | null> {
  const { data, error } = await admin
    .from("boss_events")
    .select("*")
    .eq("id", eventId)
    .eq("guild_id", guildId)
    .maybeSingle()

  if (error || !data) return null
  return data as BossEventRow
}

export async function ensureBossEventBySlotId(
  admin: SupabaseClient,
  slotId: string,
  slotType: "general" | "main",
  guildId: string,
): Promise<BossEventRow | null> {
  const existing = await getBossEventBySlotId(admin, slotId, guildId)
  if (existing) return existing

  const parsed = parseSlotId(slotId)
  if (!parsed) return null

  const { data, error } = await admin
    .from("boss_events")
    .insert({
      guild_id: guildId,
      event_date: parsed.eventDate,
      slot_hour: parsed.slotHour,
      slot_type: slotType,
    })
    .select("*")
    .single()

  if (error || !data) return null
  return data as BossEventRow
}
