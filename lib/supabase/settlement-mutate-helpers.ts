import type { SupabaseClient } from "@supabase/supabase-js"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { getSlotConfig, formatSlotTime, getSlotLabel } from "@/lib/boss-time-slots"
import { parseSlotId } from "@/lib/supabase/boss-mapper"
import { getBossEventBySlotId } from "@/lib/supabase/boss-event-helpers"
import { getGuildShareSubThousand } from "@/lib/settlement-utils"
import { calcSettlementWithPolicy } from "@/lib/operation-settings-utils"
import { resolveSettlementPolicyInputs } from "@/lib/supabase/operation-settings-data"
import { bossEventOccurredAtIso, siegeEventOccurredAtIso } from "@/lib/event-occurred-at-utils"
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
  getSettlementDbId,
  persistSettlement,
} from "@/lib/supabase/settlement-data"
import {
  appendManagementPaymentLog,
  createManagementPaymentsOnSettlementCreate,
  getManagementPaymentBySettlementMember,
  paymentSnapshotForLog,
  persistManagementPayments,
  syncPaymentStatus,
} from "@/lib/supabase/settlement-management-payment-data"
import type { SettlementManagementPayment } from "@/lib/settlement-management-payment-types"
import {
  onManagementAdminPaid,
  onManagementAdminPaidCancelled,
  onManagementMemberConfirmed,
} from "@/lib/settlement-management-payment-utils"
import { GUILD_SHARE_LEDGER_SUFFIX } from "@/lib/guild-fund-utils"
import { applyGuildShareRoundingAndLedger } from "@/lib/supabase/money-rounding-data"
import { upsertLedgerEntry } from "@/lib/supabase/finance-data"
import { makeSettlementKey, type Settlement, type SettlementSourceType } from "@/lib/settlement-types"
import { recordUsageEvent } from "@/lib/platform/usage-events"
import { sumConfirmedReceiptsForSettlement } from "@/lib/supabase/settlement-revenue-receipt-data"
import { validateRevisionAgainstReceipts } from "@/lib/settlement-revenue-receipt-utils"

function settlementLedgerSourceType(sourceType: SettlementSourceType): string {
  return sourceType === "boss" ? "boss_settlement" : "siege_settlement"
}

async function postSettlementGuildShareLedger(
  admin: SupabaseClient,
  guildId: string,
  settlement: Settlement,
  prevSettlement?: Pick<Settlement, "guildShareSubThousand" | "guildShareFinal" | "roundingUnit">,
) {
  const key = makeSettlementKey(settlement.sourceType, settlement.sourceId)
  const srcType = settlementLedgerSourceType(settlement.sourceType)
  const label = settlement.displayTitle

  if (settlement.roundingUnit == null || settlement.roundingUnit <= 1) {
    if (settlement.guildShareFinal <= 0) return
    await upsertLedgerEntry(admin, guildId, {
      transactionDate: getTodayDateString(),
      entryType: "income",
      sourceType: srcType,
      sourceId: `${key}${GUILD_SHARE_LEDGER_SUFFIX}`,
      amount: settlement.guildShareFinal,
      description: `${label} 혈맹 귀속 ${settlement.guildShareFinal.toLocaleString("ko-KR")}원`,
    })
    return
  }

  const prevSubThousand = prevSettlement
    ? (prevSettlement.guildShareSubThousand ??
      getGuildShareSubThousand(prevSettlement.guildShareFinal))
    : 0
  const nextSubThousand =
    settlement.guildShareSubThousand ?? getGuildShareSubThousand(settlement.guildShareFinal)
  const ledgerAmount =
    settlement.guildShareLedgerAmount ??
    settlement.guildShareFinal - nextSubThousand

  if (ledgerAmount <= 0 && nextSubThousand <= 0 && prevSubThousand <= 0) {
    return
  }

  await applyGuildShareRoundingAndLedger(admin, guildId, {
    settlementLedgerSourceType: srcType,
    settlementLedgerSourceId: `${key}${GUILD_SHARE_LEDGER_SUFFIX}`,
    label,
    prevSubThousand,
    nextSubThousand,
    guildShareLedgerAmount: Math.max(0, ledgerAmount),
  })
}

function finalize(settlement: Settlement): Settlement {
  return { ...settlement, overallStatus: computeOverallStatus(settlement.participants) }
}

async function calcSettlementForCreate(
  admin: SupabaseClient,
  guildId: string,
  occurredAtIso: string,
  totalRevenue: number,
  guildShareInput: number,
  managementFeeManualInput: number,
  participantCount: number,
) {
  const policyResult = await resolveSettlementPolicyInputs(
    admin,
    guildId,
    occurredAtIso,
    totalRevenue,
    guildShareInput,
    managementFeeManualInput,
  )
  if (!policyResult.ok) {
    return policyResult
  }

  const calc = calcSettlementWithPolicy({
    totalRevenue,
    participantCount,
    reserveMode: policyResult.reserveMode,
    reservePercentage: policyResult.reservePercentage,
    reserveManualInput: policyResult.reserveManualInput,
    managementFeeMode: policyResult.managementFeeMode,
    managementFeePercentage: policyResult.managementFeePercentage,
    managementFeeManualInput: policyResult.managementFeeManualInput,
    allocations: policyResult.allocations,
    policyVersionMeta: {
      policyVersionId: policyResult.policyVersionId,
      policyVersion: policyResult.policyVersion,
      policyEffectiveFrom: policyResult.policyEffectiveFrom,
    },
  })

  return { ok: true as const, calc, policyResult }
}

function settlementFromCalc(
  base: Omit<
    Settlement,
    | "totalRevenue"
    | "guildShareInput"
    | "guildShareFinal"
    | "distributableAmount"
    | "perPersonAmount"
    | "remainder"
    | "roundingUnit"
    | "roundingPolicy"
    | "guildShareLedgerAmount"
    | "guildShareSubThousand"
    | "operationPolicySnapshot"
    | "managementFeeTotal"
    | "managementFeeManualInput"
    | "reserveModeApplied"
    | "reservePercentageApplied"
    | "managementFeeModeApplied"
    | "managementFeePercentageApplied"
    | "participants"
    | "overallStatus"
  >,
  calc: ReturnType<typeof calcSettlementWithPolicy>,
  attendees: AttendeeInput[],
): Settlement {
  return finalize({
    ...base,
    totalRevenue: calc.totalRevenue,
    guildShareInput: calc.guildShareInput,
    guildShareFinal: calc.guildShareFinal,
    distributableAmount: calc.distributableAmount,
    perPersonAmount: calc.perPersonAmount,
    remainder: calc.remainder,
    roundingUnit: calc.roundingUnit,
    roundingPolicy: calc.roundingPolicy,
    guildShareLedgerAmount: calc.guildShareLedgerAmount,
    guildShareSubThousand: calc.guildShareSubThousand,
    operationPolicySnapshot: calc.operationPolicySnapshot,
    managementFeeTotal: calc.managementFeeTotal,
    managementFeeManualInput: calc.operationPolicySnapshot.managementFeeManualInput,
    reserveModeApplied: calc.operationPolicySnapshot.reserveMode,
    reservePercentageApplied: calc.operationPolicySnapshot.reservePercentage,
    managementFeeModeApplied: calc.operationPolicySnapshot.managementFeeMode,
    managementFeePercentageApplied: calc.operationPolicySnapshot.managementFeePercentage,
    participants: attendees.map((a) =>
      createInitialParticipant(a.memberId, a.name, calc.perPersonAmount),
    ),
  })
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
  managementFeeManualInput = 0,
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
  if (attendees.length === 0) return { ok: false, message: "참여자가 없어 정산할 수 없습니다." }

  const calcResult = await calcSettlementForCreate(
    admin,
    guildId,
    bossEventOccurredAtIso(parsed.eventDate, parsed.slotHour),
    totalRevenue,
    guildShareInput,
    managementFeeManualInput,
    attendees.length,
  )
  if (!calcResult.ok) return { ok: false, message: calcResult.message }
  const calc = calcResult.calc

  const time = formatSlotTime(parsed.slotHour)
  const label = getSlotLabel(slotConfig.type)

  const settlement = settlementFromCalc(
    {
      sourceType: "boss",
      sourceId: slotId,
      createdAt: Date.now(),
      revision: 1,
      overallStatus: "active",
      memo: "",
      displayTitle: `${time} ${label}`,
      displaySub: "",
      revisionSnapshots: [],
      revisionLogs: [],
      modificationLogs: [],
    },
    calc,
    attendees,
  )

  await persistSettlement(admin, settlement, actorId, guildId)
  const bossSettlementId = await getSettlementDbId(admin, guildId, "boss", slotId)
  if (bossSettlementId) {
    await createManagementPaymentsOnSettlementCreate(admin, guildId, bossSettlementId, settlement)
  }
  await postSettlementGuildShareLedger(admin, guildId, settlement)

  void recordUsageEvent(
    {
      eventType: "settlement_created",
      guildId,
      memberId: actorId,
      metadata: { sourceType: "boss" },
    },
    admin,
  )

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
  managementFeeManualInput = 0,
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
  if (attendees.length === 0) {
    return { ok: false, message: "실제 참여 확정자가 없어 정산할 수 없습니다." }
  }

  const calcResult = await calcSettlementForCreate(
    admin,
    guildId,
    siegeEventOccurredAtIso(siege.event_date, String(siege.start_time)),
    totalRevenue,
    guildShareInput,
    managementFeeManualInput,
    attendees.length,
  )
  if (!calcResult.ok) return { ok: false, message: calcResult.message }
  const calc = calcResult.calc

  const key = makeSettlementKey("siege", siegeId)
  const displayTitle = `${siege.event_date} 공성`
  const displaySub = `${String(siege.start_time).slice(0, 5)} ~ ${String(siege.end_time).slice(0, 5)}`

  const settlement = settlementFromCalc(
    {
      sourceType: "siege",
      sourceId: siegeId,
      createdAt: Date.now(),
      revision: 1,
      overallStatus: "active",
      memo: memo.trim(),
      displayTitle,
      displaySub,
      revisionSnapshots: [],
      revisionLogs: [],
      modificationLogs: [],
    },
    calc,
    attendees,
  )

  await persistSettlement(admin, settlement, actorId, guildId)
  const siegeSettlementId = await getSettlementDbId(admin, guildId, "siege", siegeId)
  if (siegeSettlementId) {
    await createManagementPaymentsOnSettlementCreate(admin, guildId, siegeSettlementId, settlement)
  }
  await postSettlementGuildShareLedger(admin, guildId, settlement)

  await admin
    .from("siege_events")
    .update({ settlement_source_key: key, settlement_status: "in_progress", status: "settling" })
    .eq("id", siege.id)
    .eq("guild_id", guildId)

  void recordUsageEvent(
    {
      eventType: "settlement_created",
      guildId,
      memberId: actorId,
      metadata: { sourceType: "siege" },
    },
    admin,
  )

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

  if (prev.overallStatus !== "completed" && next.overallStatus === "completed") {
    void recordUsageEvent(
      {
        eventType: "settlement_completed",
        guildId,
        memberId: actorId,
        metadata: { sourceType },
      },
      admin,
    )
  }

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

  const settlementDbId = await getSettlementDbId(admin, guildId, sourceType, sourceId)
  if (settlementDbId) {
    const receiptTotal = await sumConfirmedReceiptsForSettlement(admin, guildId, settlementDbId)
    const receiptGuard = validateRevisionAgainstReceipts(revised.totalRevenue, receiptTotal)
    if (!receiptGuard.ok) return { ok: false, message: receiptGuard.message }
  }

  await persistSettlement(admin, revised, actorId, guildId, {
    newRevisionLog:
      latestLog && latestSnapshot
        ? { log: latestLog, snapshot: latestSnapshot }
        : undefined,
  })

  await postSettlementGuildShareLedger(admin, guildId, revised, prev)

  return {
    ok: true,
    message: `정산 v${revised.revision}으로 수정되었습니다. (1인 ${revised.perPersonAmount.toLocaleString("ko-KR")}원)`,
  }
}

export async function loadAndUpdateManagementPayment(
  admin: SupabaseClient,
  actorId: string,
  guildId: string,
  sourceType: SettlementSourceType,
  sourceId: string,
  targetMemberId: string,
  updater: (payment: SettlementManagementPayment) => SettlementManagementPayment | null,
  logMeta: { action: string; reason?: string },
): Promise<{ ok: boolean; message: string }> {
  const settlementDbId = await getSettlementDbId(admin, guildId, sourceType, sourceId)
  if (!settlementDbId) return { ok: false, message: "정산이 없습니다." }

  const payment = await getManagementPaymentBySettlementMember(
    admin,
    guildId,
    settlementDbId,
    targetMemberId,
  )
  if (!payment) return { ok: false, message: "관리비 지급 대상이 아닙니다." }

  const before = paymentSnapshotForLog(payment)
  const updated = updater(payment)
  if (!updated) return { ok: false, message: "변경할 수 없습니다." }

  const synced = syncPaymentStatus(updated)
  if (
    before.adminPaid === synced.adminPaid &&
    before.memberConfirmed === synced.memberConfirmed &&
    before.memo === synced.memo
  ) {
    return { ok: false, message: "이미 처리된 상태입니다." }
  }

  await persistManagementPayments(admin, guildId, settlementDbId, [synced])
  await appendManagementPaymentLog(
    admin,
    guildId,
    synced.id,
    logMeta.action,
    before,
    paymentSnapshotForLog(synced),
    actorId,
    logMeta.reason ?? "",
  )

  return { ok: true, message: "저장되었습니다." }
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
