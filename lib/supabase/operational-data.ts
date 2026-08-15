import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildChecksFromRows,
  type BossEventRow,
  type BossParticipationLogRow,
  type BossParticipationRow,
} from "@/lib/supabase/boss-mapper"
import { buildSiegesFromRows } from "@/lib/supabase/siege-mapper"
import { getThisWeekSunday } from "@/lib/siege-utils"

const BOSS_EVENT_COLUMNS =
  "id,guild_id,event_date,slot_hour,slot_type,participation_status,check_code,check_started_at,check_closed_at,income_status,extra_main_bosses,income_closed_at,income_closed_by,created_at,updated_at"

const BOSS_PARTICIPATION_COLUMNS =
  "id,boss_event_id,member_id,source,status,memo,joined_at,created_by"

const BOSS_LOG_COLUMNS =
  "id,boss_event_id,target_member_id,before_state,after_state,memo,action,created_by,created_at"

export async function fetchBossOperationalData(
  supabase: SupabaseClient,
  from: string,
  to: string,
  guildId?: string,
) {
  let eventsQuery = supabase
    .from("boss_events")
    .select(BOSS_EVENT_COLUMNS)
    .gte("event_date", from)
    .lte("event_date", to)
    .order("event_date", { ascending: true })
    .order("slot_hour", { ascending: true })

  if (guildId) {
    eventsQuery = eventsQuery.eq("guild_id", guildId)
  }

  const { data: events, error: eventsError } = await eventsQuery

  if (eventsError) throw eventsError

  const eventRows = (events ?? []) as BossEventRow[]
  const eventIds = eventRows.map((e) => e.id)

  if (eventIds.length === 0) {
    return { checks: {}, slotAdminFlags: {}, events: [] as BossEventRow[] }
  }

  const membersQuery = guildId
    ? supabase.from("members").select("id, nickname").eq("guild_id", guildId)
    : supabase.from("members").select("id, nickname")

  const [participationsRes, logsRes, membersRes] = await Promise.all([
    supabase
      .from("boss_participations")
      .select(BOSS_PARTICIPATION_COLUMNS)
      .in("boss_event_id", eventIds),
    supabase
      .from("boss_participation_logs")
      .select(BOSS_LOG_COLUMNS)
      .in("boss_event_id", eventIds)
      .order("created_at", { ascending: true }),
    membersQuery,
  ])

  if (participationsRes.error) throw participationsRes.error
  if (logsRes.error) throw logsRes.error
  if (membersRes.error) throw membersRes.error

  const participations = participationsRes.data
  const logs = logsRes.data
  const members = membersRes.data

  const memberNames = new Map(
    (members ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const { checks, slotAdminFlags } = buildChecksFromRows(
    eventRows,
    (participations ?? []) as BossParticipationRow[],
    (logs ?? []) as BossParticipationLogRow[],
    memberNames,
  )

  return { checks, slotAdminFlags, events: eventRows }
}

export async function fetchSiegeOperationalData(
  supabase: SupabaseClient,
  from: string,
  to: string,
) {
  const { data: events, error: eventsError } = await supabase
    .from("siege_events")
    .select("*")
    .gte("event_date", from)
    .lte("event_date", to)
    .order("event_date", { ascending: false })

  if (eventsError) throw eventsError

  const eventRows = events ?? []
  const eventIds = eventRows.map((e: { id: string }) => e.id)

  if (eventIds.length === 0) {
    return { sieges: [] }
  }

  const [surveysRes, partsRes, adminLogsRes, attendanceLogsRes, membersRes] = await Promise.all([
    supabase.from("siege_surveys").select("*").in("siege_event_id", eventIds),
    supabase.from("siege_participations").select("*").in("siege_event_id", eventIds),
    supabase.from("siege_admin_logs").select("*").in("siege_event_id", eventIds),
    supabase.from("siege_attendance_logs").select("*").in("siege_event_id", eventIds),
    supabase.from("members").select("id, nickname"),
  ])

  if (surveysRes.error) throw surveysRes.error
  if (partsRes.error) throw partsRes.error
  if (adminLogsRes.error) throw adminLogsRes.error
  if (attendanceLogsRes.error) throw attendanceLogsRes.error
  if (membersRes.error) throw membersRes.error

  const { buildSiegesFromRows } = await import("@/lib/supabase/siege-mapper")

  const memberNames = new Map(
    (membersRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const sieges = buildSiegesFromRows(
    eventRows,
    surveysRes.data ?? [],
    partsRes.data ?? [],
    adminLogsRes.data ?? [],
    attendanceLogsRes.data ?? [],
    memberNames,
  )

  return { sieges }
}

function shiftDateString(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function defaultBossDateRange(today: string) {
  return {
    from: shiftDateString(today, -120),
    to: shiftDateString(today, 14),
  }
}

/** Home + current-month contribution: month start through upcoming slots. */
export function homeBossDateRange(today: string) {
  const monthStart = `${today.slice(0, 7)}-01`
  const weekAgo = shiftDateString(today, -7)
  const from = monthStart < weekAgo ? monthStart : weekAgo
  return {
    from,
    to: shiftDateString(today, 14),
  }
}

export function homeSiegeDateRange(today: string) {
  const sunday = getThisWeekSunday()
  return {
    from: shiftDateString(sunday, -7),
    to: shiftDateString(sunday, 21),
  }
}

export async function fetchSiegeHomeOperationalData(
  supabase: SupabaseClient,
  guildId: string,
  today: string,
) {
  const range = homeSiegeDateRange(today)
  const { data: rangeEvents, error: rangeError } = await supabase
    .from("siege_events")
    .select(
      "id,guild_id,event_date,start_time,end_time,status,memo,created_at,updated_at",
    )
    .eq("guild_id", guildId)
    .gte("event_date", range.from)
    .lte("event_date", range.to)
    .order("event_date", { ascending: false })

  if (rangeError) throw rangeError

  const { data: openSurveyEvents, error: openError } = await supabase
    .from("siege_events")
    .select(
      "id,guild_id,event_date,start_time,end_time,status,memo,created_at,updated_at",
    )
    .eq("guild_id", guildId)
    .eq("status", "survey_open")

  if (openError) throw openError

  const byId = new Map<string, (typeof rangeEvents)[number]>()
  for (const e of rangeEvents ?? []) {
    byId.set(e.id, e)
  }
  for (const e of openSurveyEvents ?? []) {
    byId.set(e.id, e)
  }

  const eventRows = [...byId.values()]
  const eventIds = eventRows.map((e) => e.id)

  if (eventIds.length === 0) {
    return { sieges: [] }
  }

  const membersQuery = supabase.from("members").select("id, nickname").eq("guild_id", guildId)

  const [surveysRes, partsRes, adminLogsRes, attendanceLogsRes, membersRes] = await Promise.all([
    supabase.from("siege_surveys").select("id,siege_event_id,member_id,response,created_at").in("siege_event_id", eventIds),
    supabase.from("siege_participations").select("id,siege_event_id,member_id,status,joined_at,created_by").in("siege_event_id", eventIds),
    supabase.from("siege_admin_logs").select("id,siege_event_id,target_member_id,before_state,after_state,memo,action,created_by,created_at").in("siege_event_id", eventIds),
    supabase.from("siege_attendance_logs").select("id,siege_event_id,member_id,status,recorded_at,created_by").in("siege_event_id", eventIds),
    membersQuery,
  ])

  if (surveysRes.error) throw surveysRes.error
  if (partsRes.error) throw partsRes.error
  if (adminLogsRes.error) throw adminLogsRes.error
  if (attendanceLogsRes.error) throw attendanceLogsRes.error
  if (membersRes.error) throw membersRes.error

  const memberNames = new Map(
    (membersRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const sieges = buildSiegesFromRows(
    eventRows,
    surveysRes.data ?? [],
    partsRes.data ?? [],
    adminLogsRes.data ?? [],
    attendanceLogsRes.data ?? [],
    memberNames,
  )

  return { sieges }
}

export function defaultSiegeDateRange(today: string) {
  return {
    from: shiftDateString(today, -365),
    to: shiftDateString(today, 60),
  }
}
