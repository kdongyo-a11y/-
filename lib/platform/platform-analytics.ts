import type { SupabaseClient } from "@supabase/supabase-js"
import {
  ACTIVE_GUILD_EVENT_TYPES,
  FEATURE_USAGE_EVENTS,
  type UsageEventType,
} from "@/lib/platform/usage-event-types"

export type PlatformPeriod = "today" | "7d" | "30d" | "all"

export type PlatformKpis = {
  totalGuilds: number
  totalMembers: number
  todayLoginUsers: number
  activeUsers7d: number
  activeUsers30d: number
  activeGuilds7d: number
  activeGuilds30d: number
  newGuildsToday: number
  newGuilds7d: number
  newGuilds30d: number
  /** 누적 business data (source of truth) */
  cumulativeBossEvents: number
  cumulativeSettlements: number
}

export type FeatureUsageStat = {
  label: string
  eventType: UsageEventType
  eventCount: number
  uniqueUsers: number
  uniqueGuilds: number
}

export type RecentGuildRow = {
  guildId: string
  serverName: string
  guildName: string
  createdAt: string
  memberCount: number
  onboardingCompleted: boolean
}

export type GuildUsageStatus = "active" | "low_activity" | "unused"

export type GuildUsageRow = {
  guildId: string
  serverName: string
  guildName: string
  memberCount: number
  lastActivityAt: string | null
  loginUsers7d: number
  bossParticipation7d: number
  siegeParticipation7d: number
  settlementCreated7d: number
  status: GuildUsageStatus
}

export type PlatformDashboardData = {
  period: PlatformPeriod
  analyticsSinceNote: string
  kpis: PlatformKpis
  featureUsage: FeatureUsageStat[]
  recentGuilds: RecentGuildRow[]
}

function startOfTodayKst(): Date {
  const now = new Date()
  const kstOffset = 9 * 60
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  const kst = new Date(utc + kstOffset * 60_000)
  kst.setHours(0, 0, 0, 0)
  return new Date(kst.getTime() - kstOffset * 60_000)
}

export function resolvePeriodStart(period: PlatformPeriod): string | null {
  if (period === "all") return null
  const now = new Date()
  if (period === "today") return startOfTodayKst().toISOString()
  const days = period === "7d" ? 7 : 30
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

type UsageEventRow = {
  event_type: string
  guild_id: string | null
  member_id: string | null
  created_at: string
}

async function fetchEventsSince(
  admin: SupabaseClient,
  since: string | null,
  eventTypes?: UsageEventType[],
): Promise<UsageEventRow[]> {
  let query = admin.from("usage_events").select("event_type, guild_id, member_id, created_at")

  if (since) query = query.gte("created_at", since)
  if (eventTypes?.length) query = query.in("event_type", eventTypes)

  const { data, error } = await query
  if (error) {
    if (error.code === "42P01") return []
    throw error
  }
  return (data ?? []) as UsageEventRow[]
}

function countDistinct(values: (string | null | undefined)[]): number {
  return new Set(values.filter(Boolean) as string[]).size
}

function countEvents(
  events: UsageEventRow[],
  eventType: UsageEventType,
  since?: string | null,
): number {
  return events.filter((e) => {
    if (e.event_type !== eventType) return false
    if (since && e.created_at < since) return false
    return true
  }).length
}

function countDistinctMembers(
  events: UsageEventRow[],
  eventType: UsageEventType,
  since?: string | null,
): number {
  return countDistinct(
    events
      .filter((e) => {
        if (e.event_type !== eventType) return false
        if (since && e.created_at < since) return false
        return true
      })
      .map((e) => e.member_id),
  )
}

function countDistinctGuilds(
  events: UsageEventRow[],
  eventType: UsageEventType,
  since?: string | null,
): number {
  return countDistinct(
    events
      .filter((e) => {
        if (e.event_type !== eventType) return false
        if (since && e.created_at < since) return false
        return true
      })
      .map((e) => e.guild_id),
  )
}

function countDistinctGuildsWithEvents(
  events: UsageEventRow[],
  eventTypes: UsageEventType[],
  since: string,
): number {
  return countDistinct(
    events
      .filter((e) => eventTypes.includes(e.event_type as UsageEventType) && e.created_at >= since)
      .map((e) => e.guild_id),
  )
}

function computeGuildStatus(lastActivityAt: string | null): GuildUsageStatus {
  if (!lastActivityAt) return "unused"
  const last = new Date(lastActivityAt).getTime()
  const now = Date.now()
  const daysSince = (now - last) / (24 * 60 * 60 * 1000)
  if (daysSince <= 7) return "active"
  if (daysSince <= 30) return "low_activity"
  return "unused"
}

export async function fetchPlatformKpis(admin: SupabaseClient): Promise<PlatformKpis> {
  const since7d = daysAgoIso(7)
  const since30d = daysAgoIso(30)
  const sinceToday = startOfTodayKst().toISOString()

  const [
    guildCountRes,
    memberCountRes,
    bossCountRes,
    settlementCountRes,
    loginEvents,
    activeGuildEvents,
    guildsRes,
  ] = await Promise.all([
    admin.from("guilds").select("*", { count: "exact", head: true }),
    admin.from("members").select("*", { count: "exact", head: true }),
    admin.from("boss_events").select("*", { count: "exact", head: true }),
    admin.from("settlements").select("*", { count: "exact", head: true }),
    fetchEventsSince(admin, since30d, ["login_success"]),
    fetchEventsSince(admin, since30d, ACTIVE_GUILD_EVENT_TYPES),
    admin.from("guilds").select("created_at"),
  ])

  const guilds = (guildsRes.data ?? []) as { created_at: string }[]

  return {
    totalGuilds: guildCountRes.count ?? 0,
    totalMembers: memberCountRes.count ?? 0,
    todayLoginUsers: countDistinctMembers(loginEvents, "login_success", sinceToday),
    activeUsers7d: countDistinctMembers(loginEvents, "login_success", since7d),
    activeUsers30d: countDistinctMembers(loginEvents, "login_success", since30d),
    activeGuilds7d: countDistinctGuildsWithEvents(activeGuildEvents, ACTIVE_GUILD_EVENT_TYPES, since7d),
    activeGuilds30d: countDistinctGuildsWithEvents(
      activeGuildEvents,
      ACTIVE_GUILD_EVENT_TYPES,
      since30d,
    ),
    newGuildsToday: guilds.filter((g) => g.created_at >= sinceToday).length,
    newGuilds7d: guilds.filter((g) => g.created_at >= since7d).length,
    newGuilds30d: guilds.filter((g) => g.created_at >= since30d).length,
    cumulativeBossEvents: bossCountRes.count ?? 0,
    cumulativeSettlements: settlementCountRes.count ?? 0,
  }
}

export async function fetchFeatureUsageStats(
  admin: SupabaseClient,
  period: PlatformPeriod,
): Promise<FeatureUsageStat[]> {
  const since = resolvePeriodStart(period)
  const events = await fetchEventsSince(admin, since)

  return FEATURE_USAGE_EVENTS.map(({ label, eventType }) => ({
    label,
    eventType,
    eventCount: countEvents(events, eventType),
    uniqueUsers: countDistinctMembers(events, eventType),
    uniqueGuilds: countDistinctGuilds(events, eventType),
  }))
}

export async function fetchRecentGuilds(
  admin: SupabaseClient,
  limit = 10,
): Promise<RecentGuildRow[]> {
  const { data: guilds, error } = await admin
    .from("guilds")
    .select("id, guild_name, server_id, created_at, onboarding_completed")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code === "42P01") return []
    throw error
  }

  if (!guilds?.length) return []

  const serverIds = [...new Set(guilds.map((g) => g.server_id))]
  const { data: servers } = await admin
    .from("game_servers")
    .select("id, name")
    .in("id", serverIds)

  const serverNames = new Map((servers ?? []).map((s) => [s.id, s.name as string]))

  const guildIds = guilds.map((g) => g.id)
  const { data: memberCounts } = await admin.from("members").select("guild_id").in("guild_id", guildIds)

  const countByGuild = new Map<string, number>()
  for (const m of memberCounts ?? []) {
    countByGuild.set(m.guild_id, (countByGuild.get(m.guild_id) ?? 0) + 1)
  }

  return guilds.map((g) => ({
    guildId: g.id,
    serverName: serverNames.get(g.server_id) ?? "—",
    guildName: g.guild_name,
    createdAt: g.created_at,
    memberCount: countByGuild.get(g.id) ?? 0,
    onboardingCompleted: g.onboarding_completed ?? false,
  }))
}

export async function fetchGuildUsageTable(admin: SupabaseClient): Promise<GuildUsageRow[]> {
  const since7d = daysAgoIso(7)

  const { data: guilds, error: guildError } = await admin
    .from("guilds")
    .select("id, guild_name, server_id, created_at")
    .eq("status", "active")
    .order("created_at", { ascending: false })

  if (guildError) {
    if (guildError.code === "42P01") return []
    throw guildError
  }

  if (!guilds?.length) return []

  const serverIds = [...new Set(guilds.map((g) => g.server_id))]
  const { data: servers } = await admin
    .from("game_servers")
    .select("id, name")
    .in("id", serverIds)
  const serverNames = new Map((servers ?? []).map((s) => [s.id, s.name as string]))

  const guildIds = guilds.map((g) => g.id)
  const { data: memberCounts } = await admin.from("members").select("guild_id").in("guild_id", guildIds)
  const countByGuild = new Map<string, number>()
  for (const m of memberCounts ?? []) {
    countByGuild.set(m.guild_id, (countByGuild.get(m.guild_id) ?? 0) + 1)
  }

  const events = await fetchEventsSince(admin, null)
  const events7d = events.filter((e) => e.created_at >= since7d)

  return guilds.map((g) => {
    const guildEvents = events.filter((e) => e.guild_id === g.id)
    const guildEvents7d = events7d.filter((e) => e.guild_id === g.id)

    const lastActivity = guildEvents.reduce<string | null>((latest, e) => {
      if (!latest || e.created_at > latest) return e.created_at
      return latest
    }, null)

    return {
      guildId: g.id,
      serverName: serverNames.get(g.server_id) ?? "—",
      guildName: g.guild_name,
      memberCount: countByGuild.get(g.id) ?? 0,
      lastActivityAt: lastActivity,
      loginUsers7d: countDistinct(guildEvents7d.filter((e) => e.event_type === "login_success").map((e) => e.member_id)),
      bossParticipation7d: countEvents(guildEvents7d, "boss_participation"),
      siegeParticipation7d: countEvents(guildEvents7d, "siege_participation"),
      settlementCreated7d: countEvents(guildEvents7d, "settlement_created"),
      status: computeGuildStatus(lastActivity),
    }
  })
}

export async function buildPlatformDashboard(
  admin: SupabaseClient,
  period: PlatformPeriod,
): Promise<PlatformDashboardData> {
  const [kpis, featureUsage, recentGuilds] = await Promise.all([
    fetchPlatformKpis(admin),
    fetchFeatureUsageStats(admin, period),
    fetchRecentGuilds(admin),
  ])

  return {
    period,
    analyticsSinceNote:
      "사용량 분석(usage_events)은 migration 015 적용 이후부터 수집됩니다. 총 혈맹/혈맹원 등 누적 지표는 기존 DB 기준입니다.",
    kpis,
    featureUsage,
    recentGuilds,
  }
}

export function parsePlatformPeriod(raw: string | null): PlatformPeriod {
  if (raw === "today" || raw === "7d" || raw === "30d" || raw === "all") return raw
  return "7d"
}

/** verify script — guild status 계산 단위 테스트용 export */
export { computeGuildStatus }
