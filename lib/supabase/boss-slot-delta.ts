import type { SupabaseClient } from "@supabase/supabase-js"
import type { SlotCheck } from "@/components/participation-context"
import type { SlotAdminFlags } from "@/lib/boss-admin-status"
import {
  buildChecksFromRows,
  parseSlotId,
  slotIdFromEvent,
  type BossEventRow,
  type BossParticipationLogRow,
  type BossParticipationRow,
} from "@/lib/supabase/boss-mapper"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"

const BOSS_EVENT_COLUMNS =
  "id,guild_id,event_date,slot_hour,slot_type,participation_status,check_code,check_started_at,check_closed_at,income_status,extra_main_bosses,income_closed_at,income_closed_by,created_at,updated_at"

const BOSS_PARTICIPATION_COLUMNS =
  "id,boss_event_id,member_id,source,status,memo,joined_at,created_by"

const BOSS_LOG_COLUMNS =
  "id,boss_event_id,target_member_id,before_state,after_state,memo,action,created_by,created_at"

async function fetchMemberNamesForIds(
  admin: SupabaseClient,
  guildId: string,
  memberIds: string[],
): Promise<Map<string, string>> {
  if (memberIds.length === 0) return new Map()
  const { data } = await admin
    .from("members")
    .select("id, nickname")
    .eq("guild_id", guildId)
    .in("id", memberIds)
  return new Map((data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]))
}

async function buildPatchForEvents(
  admin: SupabaseClient,
  guildId: string,
  events: BossEventRow[],
): Promise<{ checks: Record<string, SlotCheck>; slotAdminFlags: Record<string, SlotAdminFlags> }> {
  if (events.length === 0) {
    return { checks: {}, slotAdminFlags: {} }
  }

  const eventIds = events.map((e) => e.id)
  const [participationsRes, logsRes] = await Promise.all([
    admin
      .from("boss_participations")
      .select(BOSS_PARTICIPATION_COLUMNS)
      .in("boss_event_id", eventIds),
    admin
      .from("boss_participation_logs")
      .select(BOSS_LOG_COLUMNS)
      .in("boss_event_id", eventIds)
      .order("created_at", { ascending: true }),
  ])

  if (participationsRes.error) throw participationsRes.error
  if (logsRes.error) throw logsRes.error

  const memberIds = new Set<string>()
  for (const p of participationsRes.data ?? []) {
    memberIds.add((p as { member_id: string }).member_id)
  }
  for (const log of logsRes.data ?? []) {
    memberIds.add((log as { target_member_id: string }).target_member_id)
  }

  const memberNames = await fetchMemberNamesForIds(admin, guildId, [...memberIds])

  return buildChecksFromRows(
    events,
    (participationsRes.data ?? []) as BossParticipationRow[],
    (logsRes.data ?? []) as BossParticipationLogRow[],
    memberNames,
  )
}

/** Single or multiple slotIds — returns patch maps for affected slots only. */
export async function fetchBossSlotsPatch(
  admin: SupabaseClient,
  guildId: string,
  slotIds: string[],
): Promise<{ checks: Record<string, SlotCheck>; slotAdminFlags: Record<string, SlotAdminFlags> }> {
  const unique = [...new Set(slotIds.filter(Boolean))]
  if (unique.length === 0) {
    return { checks: {}, slotAdminFlags: {} }
  }

  const parsed = unique
    .map((slotId) => ({ slotId, parsed: parseSlotId(slotId) }))
    .filter((x): x is { slotId: string; parsed: { eventDate: string; slotHour: number } } => x.parsed != null)

  if (parsed.length === 0) {
    return { checks: {}, slotAdminFlags: {} }
  }

  const eventDates = [...new Set(parsed.map((p) => p.parsed.eventDate))]
  const { data: events, error } = await admin
    .from("boss_events")
    .select(BOSS_EVENT_COLUMNS)
    .eq("guild_id", guildId)
    .in("event_date", eventDates)

  if (error) throw error

  const slotIdSet = new Set(unique)
  const matched = ((events ?? []) as BossEventRow[]).filter((e) =>
    slotIdSet.has(slotIdFromEvent(e)),
  )

  return buildPatchForEvents(admin, guildId, matched)
}

export async function fetchBossSlotPatch(
  admin: SupabaseClient,
  guildId: string,
  slotId: string,
): Promise<{ checks: Record<string, SlotCheck>; slotAdminFlags: Record<string, SlotAdminFlags> }> {
  return fetchBossSlotsPatch(admin, guildId, [slotId])
}

/** After join by code — patch the matched open event slot. */
export async function fetchBossPatchForOpenEvent(
  admin: SupabaseClient,
  guildId: string,
  eventId: string,
): Promise<{ checks: Record<string, SlotCheck>; slotAdminFlags: Record<string, SlotAdminFlags> }> {
  const { data, error } = await admin
    .from("boss_events")
    .select(BOSS_EVENT_COLUMNS)
    .eq("guild_id", guildId)
    .eq("id", eventId)
    .maybeSingle()

  if (error) throw error
  if (!data) return { checks: {}, slotAdminFlags: {} }
  return buildPatchForEvents(admin, guildId, [data as BossEventRow])
}

export async function fetchBossPatchAfterStartCheck(
  admin: SupabaseClient,
  guildId: string,
  targetSlotId: string,
  closedEventIds: string[],
): Promise<{ checks: Record<string, SlotCheck>; slotAdminFlags: Record<string, SlotAdminFlags> }> {
  const slotIds = [targetSlotId]
  if (closedEventIds.length > 0) {
    const { data: closedEvents } = await admin
      .from("boss_events")
      .select("event_date, slot_hour")
      .eq("guild_id", guildId)
      .in("id", closedEventIds)
    for (const e of closedEvents ?? []) {
      slotIds.push(slotIdFromEvent(e as Pick<BossEventRow, "event_date" | "slot_hour">))
    }
  }
  return fetchBossSlotsPatch(admin, guildId, slotIds)
}

export async function fetchBossEventIdBySlotId(
  admin: SupabaseClient,
  guildId: string,
  slotId: string,
): Promise<string | null> {
  const event = await getBossEventBySlotId(admin, slotId, guildId)
  return event?.id ?? null
}
