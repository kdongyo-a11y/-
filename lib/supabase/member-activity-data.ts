import type { SupabaseClient } from "@supabase/supabase-js"
import { formatSlotTime } from "@/lib/boss-time-slots"
import { fetchContributionScoreSettings } from "@/lib/supabase/admin-settings-data"
import {
  resolveContributionScoresForDate,
  type ContributionScoreSetting,
} from "@/lib/contribution-score-settings"
import type { ContributionPeriod } from "@/lib/contribution-utils"

export type MemberActivityBossRecord = {
  id: string
  date: string
  time: string
  slotType: "general" | "main"
  label: string
  method: "코드" | "수동추가"
  status: "participated"
}

export type MemberActivitySiegeRecord = {
  id: string
  date: string
  time: string
  label: string
  status: "participated"
}

export type MemberActivityContributionRecord = {
  id: string
  date: string
  time: string
  label: string
  kind: "general" | "main" | "siege"
  points: number
}

export type MemberActivitySummary = {
  bossTotal: number
  bossMain: number
  bossGeneral: number
  siegeTotal: number
  contributionTotal: number
}

export type MemberActivityResult = {
  summary: MemberActivitySummary
  bossRecords: MemberActivityBossRecord[]
  siegeRecords: MemberActivitySiegeRecord[]
  contributionRecords: MemberActivityContributionRecord[]
}

const SIEGE_ELIGIBLE = new Set(["attendance_confirmed", "settling", "completed"])

function mapMethod(source: "code" | "manual"): "코드" | "수동추가" {
  return source === "code" ? "코드" : "수동추가"
}

function buildContributionRecords(
  bossRecords: MemberActivityBossRecord[],
  siegeRecords: MemberActivitySiegeRecord[],
  scoreSettings: ContributionScoreSetting[],
): MemberActivityContributionRecord[] {
  const records: MemberActivityContributionRecord[] = []

  for (const boss of bossRecords) {
    const scores = resolveContributionScoresForDate(scoreSettings, boss.date)
    const points = boss.slotType === "main" ? scores.mainBossScore : scores.generalBossScore
    records.push({
      id: `c-boss-${boss.id}`,
      date: boss.date,
      time: boss.time,
      label: boss.slotType === "main" ? "메인 보스타임" : "일반 보스타임",
      kind: boss.slotType === "main" ? "main" : "general",
      points,
    })
  }

  for (const siege of siegeRecords) {
    const scores = resolveContributionScoresForDate(scoreSettings, siege.date)
    records.push({
      id: `c-siege-${siege.id}`,
      date: siege.date,
      time: siege.time,
      label: "공성",
      kind: "siege",
      points: scores.siegeScore,
    })
  }

  records.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
  return records
}

export async function fetchMemberActivity(
  admin: SupabaseClient,
  memberId: string,
  period: ContributionPeriod,
): Promise<MemberActivityResult> {
  const { data: memberRow } = await admin
    .from("members")
    .select("guild_id")
    .eq("id", memberId)
    .maybeSingle()

  const guildId = memberRow?.guild_id as string | undefined
  if (!guildId) {
    return {
      summary: {
        bossTotal: 0,
        bossMain: 0,
        bossGeneral: 0,
        siegeTotal: 0,
        contributionTotal: 0,
      },
      bossRecords: [],
      siegeRecords: [],
      contributionRecords: [],
    }
  }

  const scoreSettings = await fetchContributionScoreSettings(admin, guildId)

  const { data: bossRows, error: bossError } = await admin
    .from("boss_participations")
    .select(
      `
      id,
      source,
      status,
      boss_events!inner (
        event_date,
        slot_hour,
        slot_type,
        participation_status,
        guild_id
      )
    `,
    )
    .eq("member_id", memberId)
    .eq("status", "participated")
    .eq("boss_events.guild_id", guildId)
    .gte("boss_events.event_date", period.start)
    .lte("boss_events.event_date", period.end)

  if (bossError) {
    console.error("[fetchMemberActivity/boss]", bossError)
  }

  const bossRecords: MemberActivityBossRecord[] = (bossRows ?? [])
    .map((row) => {
      const event = row.boss_events as {
        event_date: string
        slot_hour: number
        slot_type: "general" | "main"
        participation_status: string
      } | null
      if (!event || event.participation_status !== "closed") return null
      const time = formatSlotTime(event.slot_hour)
      return {
        id: row.id as string,
        date: event.event_date,
        time,
        slotType: event.slot_type,
        label: `${event.event_date.slice(5).replace("-", "/")} ${time} ${event.slot_type === "main" ? "메인" : "일반"} 보스타임`,
        method: mapMethod(row.source as "code" | "manual"),
        status: "participated" as const,
      }
    })
    .filter((r): r is MemberActivityBossRecord => r !== null)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))

  const { data: siegeRows, error: siegeError } = await admin
    .from("siege_participations")
    .select(
      `
      id,
      status,
      siege_events!inner (
        event_date,
        start_time,
        status,
        guild_id
      )
    `,
    )
    .eq("member_id", memberId)
    .eq("status", "participated")
    .eq("siege_events.guild_id", guildId)
    .gte("siege_events.event_date", period.start)
    .lte("siege_events.event_date", period.end)

  if (siegeError) {
    console.error("[fetchMemberActivity/siege]", siegeError)
  }

  const siegeRecords: MemberActivitySiegeRecord[] = (siegeRows ?? [])
    .map((row) => {
      const event = row.siege_events as {
        event_date: string
        start_time: string
        status: string
      } | null
      if (!event || !SIEGE_ELIGIBLE.has(event.status)) return null
      return {
        id: row.id as string,
        date: event.event_date,
        time: event.start_time ?? "00:00",
        label: `${event.event_date.slice(5).replace("-", "/")} 공성`,
        status: "participated" as const,
      }
    })
    .filter((r): r is MemberActivitySiegeRecord => r !== null)
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))

  const contributionRecords = buildContributionRecords(bossRecords, siegeRecords, scoreSettings)
  const bossMain = bossRecords.filter((r) => r.slotType === "main").length
  const bossGeneral = bossRecords.filter((r) => r.slotType === "general").length

  return {
    summary: {
      bossTotal: bossRecords.length,
      bossMain,
      bossGeneral,
      siegeTotal: siegeRecords.length,
      contributionTotal: contributionRecords.reduce((sum, r) => sum + r.points, 0),
    },
    bossRecords,
    siegeRecords,
    contributionRecords,
  }
}
