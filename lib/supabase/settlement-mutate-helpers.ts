import type { SupabaseClient } from "@supabase/supabase-js"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { getSlotConfig, formatSlotTime, getSlotLabel } from "@/lib/boss-time-slots"
import { parseSlotId } from "@/lib/supabase/boss-mapper"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"
import { calcSettlement } from "@/lib/settlement-utils"
import {
  computeOverallStatus,
  createInitialParticipant,
  derivePersonalStatusAfterPayment,
  onAdditionalAdminPaid,
  onAdditionalAdminPaymentConfirmationCancelled,
  onAdminPaymentConfirmed,
  onAdminPaymentConfirmationCancelled,
  onAdminReturnConfirmed,
  onAdminReturnConfirmationCancelled,
  onMemberReceiptConfirmed,
  onMemberReturnConfirmed,
  reviseSettlementParticipants,
  type AttendeeInput,
} from "@/lib/settlement-revision-utils"
import {
  getSettlementByKey,
  persistSettlement,
} from "@/lib/supabase/settlement-data"
import { GUILD_SHARE_LEDGER_SUFFIX } from "@/lib/guild-fund-utils"
import { upsertLedgerEntry } from "@/lib/supabase/finance-data"
import { makeSettlementKey, type Settlement, type SettlementSourceType } from "@/lib/settlement-types"

function settlementLedgerSourceType(sourceType: SettlementSourceType): string {
  return sourceType === "boss" ? "boss_settlement" : "siege_settlement"
}

async function postSettlementGuildShareLedger(
  admin: SupabaseClient,
  guildId: string,
  settlement: Settlement,
) {
  if (settlement.guildShareFinal <= 0) return

  const key = makeSettlementKey(settlement.sourceType, settlement.sourceId)
  const srcType = settlementLedgerSourceType(settlement.sourceType)
  const label = settlement.displayTitle

  await upsertLedgerEntry(admin, guildId, {
    transactionDate: getTodayDateString(),
    entryType: "income",
    sourceType: srcType,
    sourceId: `${key}${GUILD_SHARE_LEDGER_SUFFIX}`,
    amount: settlement.guildShareFinal,
    description: `${label} 혈맹 귀속 ${settlement.guildShareFinal.toLocaleString("ko-KR")}원`,
  })
}

function finalize(settlement: Settlement): Settlement {
  return { ...settlement, overallStatus: computeOverallStatus(settlement.participants) }
}

async function fetchBossAttendeesFromDb(
  admin: SupabaseClient,
  slotId: string,
  guildId: string,
): Promise<{ ok: true; attendees: AttendeeInput[] } | { ok: false; message: string }> {
  const event = await getBossEventBySlotId(admin, slotId, guildId)
  if (!event) {
    return { ok: false, message: "보스타임 이벤트를 찾을 수 없습니다." }
  }

  const { data: parts, error } = await admin
    .from("boss_participations")
    .select("member_id")
    .eq("boss_event_id", event.id)
    .eq("status", "participated")

  if (error) {
    console.error("[fetchBossAttendeesFromDb]", error)
    return { ok: false, message: "참여자 목록을 불러오지 못했습니다." }
  }

  const { data: members } = await admin
    .from("members")
    .select("id, nickname")
    .eq("guild_id", guildId)
  const names = new Map((members ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]))

  const attendees: AttendeeInput[] = (parts ?? []).map((p: { member_id: string }) => ({
    memberId: p.member_id,
    name: names.get(p.member_id) ?? "혈원",
  }))

  if (attendees.length === 0) {
    return { ok: false, message: "참여자가 없어 정산을 수정할 수 없습니다." }
  }

  return { ok: true, attendees }
}

export async function createBossSettlementOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  slotId: string,
  totalRevenue: number,
  guildShareInput: number,
): Promise<{ ok: boolean; message: string }> {
  const existing = await getSettlementByKey(admin, guildId, "boss", slotId)
  if (existing) return { ok: false, message: "이미 정산이 생성되었습니다." }

  const event = await getBossEventBySlotId(admin, slotId, guildId)
  if (!event || event.participation_status !== "closed") {
    return { ok: false, message: "마감된 보스타임만 정산할 수 있습니다." }
  }

  const parsed = parseSlotId(slotId)
  if (!parsed) return { ok: false, message: "보스타임을 찾을 수 없습니다." }

  const slotConfig = getSlotConfig(parsed.slotHour)
  const attendeeResult = await fetchBossAttendeesFromDb(admin, slotId, guildId)
  if (!attendeeResult.ok) return { ok: false, message: attendeeResult.message }
  const attendees = attendeeResult.attendees

  if (totalRevenue <= 0) return { ok: false, message: "총 수익금을 입력해주세요." }
  if (guildShareInput < 0 || guildShareInput > totalRevenue) {
    return { ok: false, message: "혈맹 귀속금이 올바르지 않습니다." }
  }
  if (attendees.length === 0) return { ok: false, message: "참여자가 없어 정산할 수 없습니다." }

  const calc = calcSettlement({
    totalRevenue,
    guildShareInput,
    participantCount: attendees.length,
  })

  const time = formatSlotTime(parsed.slotHour)
  const label = getSlotLabel(slotConfig.type)

  const settlement: Settlement = finalize({
    sourceType: "boss",
    sourceId: slotId,
    createdAt: Date.now(),
    revision: 1,
    overallStatus: "active",
    totalRevenue,
    guildShareInput,
    guildShareFinal: calc.guildShareFinal,
    distributableAmount: calc.distributableAmount,
    perPersonAmount: calc.perPersonAmount,
    remainder: calc.remainder,
    memo: "",
    displayTitle: `${time} ${label}`,
    displaySub: "",
    participants: attendees.map((a) => createInitialParticipant(a.memberId, a.name, calc.perPersonAmount)),
    revisionSnapshots: [],
    revisionLogs: [],
    modificationLogs: [],
  })

  await persistSettlement(admin, settlement, actorId, guildId)
  await postSettlementGuildShareLedger(admin, guildId, settlement)

  return { ok: true, message: "정산이 생성되었습니다." }
}

export async function createSiegeSettlementOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  siegeId: string,
  totalRevenue: number,
  guildShareInput: number,
  memo = "",
): Promise<{ ok: boolean; message: string }> {
  const existing = await getSettlementByKey(admin, guildId, "siege", siegeId)
  if (existing) return { ok: false, message: "이미 공성 정산이 생성되었습니다." }

  const eventDate = siegeId.startsWith("siege-") ? siegeId.slice(6) : siegeId
  const { data: siege } = await admin
    .from("siege_events")
    .select("*")
    .eq("guild_id", guildId)
    .eq("event_date", eventDate)
    .maybeSingle()

  if (!siege) return { ok: false, message: "공성을 찾을 수 없습니다." }
  if (siege.status !== "attendance_confirmed" && siege.status !== "settling") {
    return { ok: false, message: "실제 참여가 확정된 공성만 정산할 수 있습니다." }
  }

  const { data: parts } = await admin
    .from("siege_participations")
    .select("member_id")
    .eq("siege_event_id", siege.id)
    .eq("status", "participated")

  const { data: members } = await admin
    .from("members")
    .select("id, nickname")
    .eq("guild_id", guildId)
  const names = new Map((members ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]))

  const attendees: AttendeeInput[] = (parts ?? []).map((p: { member_id: string }) => ({
    memberId: p.member_id,
    name: names.get(p.member_id) ?? "혈원",
  }))

  if (totalRevenue <= 0) return { ok: false, message: "총 공성 수익을 입력해주세요." }
  if (guildShareInput < 0 || guildShareInput > totalRevenue) {
    return { ok: false, message: "혈맹 귀속금이 올바르지 않습니다." }
  }
  if (attendees.length === 0) {
    return { ok: false, message: "실제 참여 확정자가 없어 정산할 수 없습니다." }
  }

  const calc = calcSettlement({
    totalRevenue,
    guildShareInput,
    participantCount: attendees.length,
  })

  const key = makeSettlementKey("siege", siegeId)
  const displayTitle = `${siege.event_date} 공성`
  const displaySub = `${String(siege.start_time).slice(0, 5)} ~ ${String(siege.end_time).slice(0, 5)}`

  const settlement: Settlement = finalize({
    sourceType: "siege",
    sourceId: siegeId,
    createdAt: Date.now(),
    revision: 1,
    overallStatus: "active",
    totalRevenue,
    guildShareInput,
    guildShareFinal: calc.guildShareFinal,
    distributableAmount: calc.distributableAmount,
    perPersonAmount: calc.perPersonAmount,
    remainder: calc.remainder,
    memo: memo.trim(),
    displayTitle,
    displaySub,
    participants: attendees.map((a) => createInitialParticipant(a.memberId, a.name, calc.perPersonAmount)),
    revisionSnapshots: [],
    revisionLogs: [],
    modificationLogs: [],
  })

  await persistSettlement(admin, settlement, actorId, guildId)
  await postSettlementGuildShareLedger(admin, guildId, settlement)

  await admin
    .from("siege_events")
    .update({ settlement_source_key: key, settlement_status: "in_progress", status: "settling" })
    .eq("id", siege.id)
    .eq("guild_id", guildId)

  return { ok: true, message: "공성 정산이 생성되었습니다." }
}

export async function loadAndUpdateSettlement(
  admin: SupabaseClient,
  actorId: string | null,
  guildId: string,
  sourceType: SettlementSourceType,
  sourceId: string,
  updater: (prev: Settlement) => Settlement,
  options?: Parameters<typeof persistSettlement>[4],
): Promise<{ ok: boolean; message: string; settlement?: Settlement }> {
  const prev = await getSettlementByKey(admin, guildId, sourceType, sourceId)
  if (!prev) return { ok: false, message: "정산이 없습니다." }
  const next = finalize(updater(prev))
  await persistSettlement(admin, next, actorId, guildId, options)
  return { ok: true, message: "저장되었습니다.", settlement: next }
}

export async function reviseSettlementOnServer(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  sourceType: SettlementSourceType,
  sourceId: string,
  attendees: AttendeeInput[],
  reason: string,
): Promise<{ ok: boolean; message: string }> {
  const prev = await getSettlementByKey(admin, guildId, sourceType, sourceId)
  if (!prev) return { ok: false, message: "정산이 없습니다." }
  if (!reason.trim()) return { ok: false, message: "수정 사유를 입력해주세요." }

  let resolvedAttendees = attendees
  if (sourceType === "boss") {
    const fetched = await fetchBossAttendeesFromDb(admin, sourceId, guildId)
    if (!fetched.ok) return { ok: false, message: fetched.message }
    resolvedAttendees = fetched.attendees
  } else if (resolvedAttendees.length === 0) {
    return { ok: false, message: "참여자가 없어 정산을 수정할 수 없습니다." }
  }

  const revised = reviseSettlementParticipants(prev, resolvedAttendees, reason.trim())
  const latestLog = revised.revisionLogs[revised.revisionLogs.length - 1]
  const latestSnapshot = revised.revisionSnapshots[revised.revisionSnapshots.length - 1]

  await persistSettlement(admin, revised, actorId, guildId, {
    newRevisionLog:
      latestLog && latestSnapshot
        ? { log: latestLog, snapshot: latestSnapshot }
        : undefined,
  })

  await postSettlementGuildShareLedger(admin, guildId, revised)

  return {
    ok: true,
    message: `정산 v${revised.revision}으로 수정되었습니다. (1인 ${revised.perPersonAmount.toLocaleString("ko-KR")}원)`,
  }
}

export {
  onAdminPaymentConfirmed,
  onAdminPaymentConfirmationCancelled,
  onMemberReceiptConfirmed,
  onMemberReturnConfirmed,
  onAdminReturnConfirmed,
  onAdminReturnConfirmationCancelled,
  onAdditionalAdminPaid,
  onAdditionalAdminPaymentConfirmationCancelled,
  derivePersonalStatusAfterPayment,
  getSettlementByKey,
}
