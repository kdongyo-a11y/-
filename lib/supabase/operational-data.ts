import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildChecksFromRows,
  type BossEventRow,
  type BossParticipationLogRow,
  type BossParticipationRow,
} from "@/lib/supabase/boss-mapper"
import { buildSiegesFromRows } from "@/lib/supabase/siege-mapper"

export async function fetchBossOperationalData(
  supabase: SupabaseClient,
  from: string,
  to: string,
) {
  const { data: events, error: eventsError } = await supabase
    .from("boss_events")
    .select("*")
    .gte("event_date", from)
    .lte("event_date", to)
    .order("event_date", { ascending: true })
    .order("slot_hour", { ascending: true })

  if (eventsError) throw eventsError

  const eventRows = (events ?? []) as BossEventRow[]
  const eventIds = eventRows.map((e) => e.id)

  if (eventIds.length === 0) {
    return { checks: {}, slotAdminFlags: {}, events: [] as BossEventRow[] }
  }

  const { data: participations, error: partError } = await supabase
    .from("boss_participations")
    .select("*")
    .in("boss_event_id", eventIds)

  if (partError) throw partError

  const { data: logs, error: logsError } = await supabase
    .from("boss_participation_logs")
    .select("*")
    .in("boss_event_id", eventIds)
    .order("created_at", { ascending: true })

  if (logsError) throw logsError

  const { data: members, error: membersError } = await supabase
    .from("members")
    .select("id, nickname")

  if (membersError) throw membersError

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

export function defaultSiegeDateRange(today: string) {
  return {
    from: shiftDateString(today, -365),
    to: shiftDateString(today, 60),
  }
}
