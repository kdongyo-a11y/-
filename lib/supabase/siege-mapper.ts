import type {
  ConfirmedAttendeeMethod,
  SiegeAdminLog,
  SiegeAttendanceChangeLog,
  SiegeConfirmedAttendee,
  SiegeEvent,
  SiegeStatus,
  SiegeSurveyEntry,
  SurveyResponse,
} from "@/components/siege-context"
import type { SiegeFinancialFlags } from "@/lib/siege-admin-status"
import { makeSiegeId } from "@/lib/siege-utils"

export type SiegeEventRow = {
  id: string
  event_date: string
  start_time: string
  end_time: string
  status: SiegeStatus
  survey_opened_at: string | null
  survey_closed_at: string | null
  attendance_confirmed_at: string | null
  income_status: "unprocessed" | "no_income" | "income_declared"
  settlement_status: "none" | "in_progress" | "completed"
  settlement_source_key: string | null
  memo: string
  created_at: string
  updated_at: string
}

export type SiegeSurveyRow = {
  id: string
  siege_event_id: string
  member_id: string
  response: "attending" | "not_attending"
  updated_at: string
  members?: { nickname: string } | null
}

export type SiegeParticipationRow = {
  id: string
  siege_event_id: string
  member_id: string
  status: "participated" | "excluded"
  source: "confirmed" | "manual"
  memo: string | null
  was_survey_intended: boolean
  confirmed_at: string
  created_by: string | null
  members?: { nickname: string } | null
}

export type SiegeAdminLogRow = {
  id: string
  siege_event_id: string
  phase: "survey" | "attendance"
  target_member_id: string
  before_state: string
  after_state: string
  memo: string
  action: string
  created_by: string | null
  created_at: string
}

export type SiegeAttendanceLogRow = {
  id: string
  siege_event_id: string
  member_id: string
  change_type: "ADD" | "REMOVE"
  before_state: string
  after_state: string
  reason: string
  created_by: string | null
  created_at: string
}

function toEpoch(iso: string | null): number | null {
  if (!iso) return null
  return new Date(iso).getTime()
}

function formatTimeValue(value: string): string {
  return value.slice(0, 5)
}

export function dbSurveyToUi(response: "attending" | "not_attending"): SurveyResponse {
  return response === "attending" ? "참여 예정" : "불참 예정"
}

export function uiSurveyToDb(response: SurveyResponse): "attending" | "not_attending" {
  return response === "참여 예정" ? "attending" : "not_attending"
}

export function rowToSiegeFinancialFlags(row: SiegeEventRow): SiegeFinancialFlags {
  return {
    noIncomeClosed: row.income_status === "no_income",
    incomeDeclared: row.income_status === "income_declared",
  }
}

export function buildSiegeEventFromRows(
  event: SiegeEventRow,
  surveys: SiegeSurveyRow[],
  participations: SiegeParticipationRow[],
  adminLogs: SiegeAdminLogRow[],
  attendanceLogs: SiegeAttendanceLogRow[],
  memberNames: Map<string, string>,
): SiegeEvent {
  const surveyResponses: SiegeSurveyEntry[] = surveys.map((s) => ({
    memberId: s.member_id,
    name: s.members?.nickname ?? memberNames.get(s.member_id) ?? "혈원",
    response: dbSurveyToUi(s.response),
    respondedAt: toEpoch(s.updated_at) ?? Date.now(),
  }))

  const confirmedAttendees: SiegeConfirmedAttendee[] = participations
    .filter((p) => p.status === "participated")
    .map((p) => ({
      memberId: p.member_id,
      name: p.members?.nickname ?? memberNames.get(p.member_id) ?? "혈원",
      confirmedAt: toEpoch(p.confirmed_at) ?? Date.now(),
      method: (p.source === "manual" ? "관리자 수동추가" : "참여 확정") as ConfirmedAttendeeMethod,
      wasSurveyIntended: p.was_survey_intended,
    }))

  const manualAdjustments: SiegeAdminLog[] = adminLogs.map((log) => ({
    id: log.id,
    at: toEpoch(log.created_at) ?? Date.now(),
    phase: log.phase,
    targetMemberId: log.target_member_id,
    targetName: memberNames.get(log.target_member_id) ?? "혈원",
    beforeState: log.before_state,
    afterState: log.after_state,
    memo: log.memo,
    action: log.action,
  }))

  const attendanceChangeLogs: SiegeAttendanceChangeLog[] = attendanceLogs.map((log) => ({
    id: log.id,
    memberId: log.member_id,
    name: memberNames.get(log.member_id) ?? "혈원",
    changeType: log.change_type,
    beforeState: log.before_state,
    afterState: log.after_state,
    reason: log.reason,
    changedAt: toEpoch(log.created_at) ?? Date.now(),
    adminId: log.created_by ?? "",
  }))

  return {
    id: makeSiegeId(event.event_date),
    eventDate: event.event_date,
    startTime: formatTimeValue(event.start_time),
    endTime: formatTimeValue(event.end_time),
    status: event.status,
    memo: event.memo,
    settlementId: event.settlement_source_key,
    surveyResponses,
    surveyOpenedAt: toEpoch(event.survey_opened_at),
    surveyClosedAt: toEpoch(event.survey_closed_at),
    confirmedAttendees,
    attendanceConfirmedAt: toEpoch(event.attendance_confirmed_at),
    manualAdjustments,
    attendanceChangeLogs,
    financialFlags: rowToSiegeFinancialFlags(event),
  }
}

export function buildSiegesFromRows(
  events: SiegeEventRow[],
  surveys: SiegeSurveyRow[],
  participations: SiegeParticipationRow[],
  adminLogs: SiegeAdminLogRow[],
  attendanceLogs: SiegeAttendanceLogRow[],
  memberNames: Map<string, string>,
): SiegeEvent[] {
  return events.map((event) => {
    const eventSurveys = surveys.filter((s) => s.siege_event_id === event.id)
    const eventParts = participations.filter((p) => p.siege_event_id === event.id)
    const eventAdminLogs = adminLogs.filter((l) => l.siege_event_id === event.id)
    const eventAttendanceLogs = attendanceLogs.filter((l) => l.siege_event_id === event.id)
    return buildSiegeEventFromRows(
      event,
      eventSurveys,
      eventParts,
      eventAdminLogs,
      eventAttendanceLogs,
      memberNames,
    )
  })
}
