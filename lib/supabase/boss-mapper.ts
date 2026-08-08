import type {
  AdminModificationLog,
  Attendee,
  AttendeeMethod,
  SlotCheck,
  SlotCheckStatus,
} from "@/components/participation-context"
import type { SlotAdminFlags } from "@/lib/boss-admin-status"
import { makeSlotId } from "@/lib/boss-time-slots"

export type BossEventRow = {
  id: string
  guild_id: string
  event_date: string
  slot_hour: number
  slot_type: "general" | "main"
  participation_status: SlotCheckStatus
  check_code: string | null
  check_started_at: string | null
  check_closed_at: string | null
  income_status: "unprocessed" | "no_income" | "income_declared"
  extra_main_bosses: string[]
  income_closed_at: string | null
  income_closed_by: string | null
  created_at: string
  updated_at: string
}

export type BossParticipationRow = {
  id: string
  boss_event_id: string
  member_id: string
  source: "code" | "manual"
  status: "participated" | "excluded"
  memo: string | null
  joined_at: string
  created_by: string | null
  members?: { nickname: string } | null
}

export type BossParticipationLogRow = {
  id: string
  boss_event_id: string
  target_member_id: string
  before_state: "미참여" | "참여"
  after_state: "미참여" | "참여"
  memo: string
  action: "수동추가" | "수동제외"
  created_by: string | null
  created_at: string
}

export function parseSlotId(slotId: string): { eventDate: string; slotHour: number } | null {
  const match = slotId.match(/^(\d{4}-\d{2}-\d{2})-(\d{1,2})$/)
  if (!match) return null
  return { eventDate: match[1], slotHour: parseInt(match[2], 10) }
}

export function slotIdFromEvent(row: Pick<BossEventRow, "event_date" | "slot_hour">): string {
  return makeSlotId(row.event_date, row.slot_hour)
}

function toEpoch(iso: string | null): number | null {
  if (!iso) return null
  return new Date(iso).getTime()
}

function mapSourceToMethod(source: "code" | "manual"): AttendeeMethod {
  return source === "code" ? "코드" : "수동추가"
}

export function rowToSlotAdminFlags(row: BossEventRow): SlotAdminFlags {
  return {
    noIncomeClosed: row.income_status === "no_income",
    incomeDeclared: row.income_status === "income_declared",
  }
}

export function buildChecksFromRows(
  events: BossEventRow[],
  participations: BossParticipationRow[],
  logs: BossParticipationLogRow[],
  memberNames: Map<string, string>,
): { checks: Record<string, SlotCheck>; slotAdminFlags: Record<string, SlotAdminFlags> } {
  const participationsByEvent = new Map<string, BossParticipationRow[]>()
  for (const p of participations) {
    if (p.status !== "participated") continue
    const list = participationsByEvent.get(p.boss_event_id) ?? []
    list.push(p)
    participationsByEvent.set(p.boss_event_id, list)
  }

  const logsByEvent = new Map<string, BossParticipationLogRow[]>()
  for (const log of logs) {
    const list = logsByEvent.get(log.boss_event_id) ?? []
    list.push(log)
    logsByEvent.set(log.boss_event_id, list)
  }

  const checks: Record<string, SlotCheck> = {}
  const slotAdminFlags: Record<string, SlotAdminFlags> = {}

  for (const event of events) {
    const slotId = slotIdFromEvent(event)
    const eventParts = participationsByEvent.get(event.id) ?? []
    const attendees: Attendee[] = eventParts.map((p) => ({
      memberId: p.member_id,
      name: p.members?.nickname ?? memberNames.get(p.member_id) ?? "혈원",
      checkedAt: toEpoch(p.joined_at) ?? Date.now(),
      method: mapSourceToMethod(p.source),
    }))

    const adminLogs: AdminModificationLog[] = (logsByEvent.get(event.id) ?? []).map((log) => ({
      id: log.id,
      at: toEpoch(log.created_at) ?? Date.now(),
      targetMemberId: log.target_member_id,
      targetName: memberNames.get(log.target_member_id) ?? "혈원",
      beforeState: log.before_state,
      afterState: log.after_state,
      memo: log.memo,
      action: log.action,
    }))

    checks[slotId] = {
      slotId,
      code: event.check_code ?? "",
      status: event.participation_status,
      startedAt: toEpoch(event.check_started_at),
      closedAt: toEpoch(event.check_closed_at),
      attendees,
      adminLogs,
      extraMainBosses: event.extra_main_bosses ?? [],
    }
    slotAdminFlags[slotId] = rowToSlotAdminFlags(event)
  }

  return { checks, slotAdminFlags }
}

export function generateBossCheckCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000))
}
