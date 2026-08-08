import { calcSettlement } from "@/lib/settlement-utils"
import type {
  Settlement,
  SettlementMemberAdjustmentLog,
  SettlementParticipant,
  SettlementPersonalStatus,
  SettlementRevisionLog,
  SettlementRevisionSnapshot,
  SettlementAdjustmentType,
  SettlementOverallStatus,
  PendingReceiptItem,
} from "@/lib/settlement-types"

export type AttendeeInput = { memberId: string; name: string }

export function getPaidAmount(p: SettlementParticipant): number {
  if (p.paidAmount > 0) return p.paidAmount
  if (p.adminPaid) return p.payoutAmount
  return 0
}

/** revision 이전 기존 지급분 (paid_amount 기준) */
export function getBasePaidAmount(p: SettlementParticipant): number {
  return getPaidAmount(p)
}

/** 현재 revision 기준 최종 정산금 */
export function getFinalAmount(p: SettlementParticipant): number {
  return p.payoutAmount
}

/** 관리자가 지급 완료 처리한 누적 금액 */
export function getAdminPaidCumulative(p: SettlementParticipant): number {
  if (p.adjustmentType === "return") return 0

  let total = 0
  if (p.adminPaid) {
    total += getBasePaidAmount(p)
  }
  if (p.adjustmentType === "additional" && p.additionalAdminPaid) {
    total += p.additionalAmount
  }
  return total
}

/** 혈원이 수령 확인한 누적 금액 */
export function getMemberConfirmedCumulative(p: SettlementParticipant): number {
  if (p.adjustmentType === "return") return 0

  let total = 0
  if (p.memberReceived) {
    total += getBasePaidAmount(p)
  }
  if (p.adjustmentType === "additional" && p.additionalMemberReceived) {
    total += p.additionalAmount
  }
  return total
}

/**
 * 개인 누적 분배금 — 실제 수령(확인) 기준.
 * 반환: 완료 전 = 기존 수령 보유액, 완료 후 = 최종 유지액(payoutAmount).
 */
export function getMemberReceivedPayoutAmount(p: SettlementParticipant): number {
  if (p.adjustmentType === "return") {
    if (p.personalStatus === "return_completed") {
      return p.payoutAmount
    }
    return getPaidAmount(p)
  }
  return getMemberConfirmedCumulative(p)
}

export function sumMemberReceivedPayoutForSettlements(
  participants: SettlementParticipant[],
): number {
  return participants.reduce((sum, p) => sum + getMemberReceivedPayoutAmount(p), 0)
}

export function isPayoutFullyAdminConfirmed(p: SettlementParticipant): boolean {
  if (p.adjustmentType === "return") return false
  return getAdminPaidCumulative(p) >= getFinalAmount(p)
}

export function isPayoutFullyMemberConfirmed(p: SettlementParticipant): boolean {
  if (p.adjustmentType === "return") return false
  return getMemberConfirmedCumulative(p) >= getFinalAmount(p)
}

export function isPayoutFullySettled(p: SettlementParticipant): boolean {
  return isPayoutFullyAdminConfirmed(p) && isPayoutFullyMemberConfirmed(p)
}

export type MemberReceiptPendingState = {
  finalAmount: number
  basePaidAmount: number
  additionalAmount: number
  baseConfirmed: boolean
  adminPaidCumulative: number
  memberConfirmedCumulative: number
  confirmAmount: number
  kind: PendingReceiptItem["kind"]
  actionable: boolean
}

export function getMemberReceiptPendingState(
  p: SettlementParticipant,
): MemberReceiptPendingState | null {
  if (p.adjustmentType === "return") return null
  if (isPayoutFullyMemberConfirmed(p)) return null

  const finalAmount = getFinalAmount(p)
  const basePaidAmount = getBasePaidAmount(p)
  const additionalAmount = p.additionalAmount
  const baseConfirmed = p.memberReceived
  const adminPaidCumulative = getAdminPaidCumulative(p)
  const memberConfirmedCumulative = getMemberConfirmedCumulative(p)

  if (p.adjustmentType === "additional") {
    if (!isPayoutFullyAdminConfirmed(p)) {
      return {
        finalAmount,
        basePaidAmount,
        additionalAmount,
        baseConfirmed,
        adminPaidCumulative,
        memberConfirmedCumulative,
        confirmAmount: 0,
        kind: "admin_pending",
        actionable: false,
      }
    }

    if (baseConfirmed && !p.additionalMemberReceived) {
      return {
        finalAmount,
        basePaidAmount,
        additionalAmount,
        baseConfirmed,
        adminPaidCumulative,
        memberConfirmedCumulative,
        confirmAmount: additionalAmount,
        kind: "additional_only",
        actionable: true,
      }
    }

    if (!baseConfirmed) {
      return {
        finalAmount,
        basePaidAmount,
        additionalAmount,
        baseConfirmed,
        adminPaidCumulative,
        memberConfirmedCumulative,
        confirmAmount: finalAmount,
        kind: "total",
        actionable: true,
      }
    }

    return null
  }

  if (p.adminPaid && !p.memberReceived) {
    return {
      finalAmount,
      basePaidAmount,
      additionalAmount: 0,
      baseConfirmed,
      adminPaidCumulative,
      memberConfirmedCumulative,
      confirmAmount: finalAmount,
      kind: "initial",
      actionable: true,
    }
  }

  return null
}

export function createInitialParticipant(
  memberId: string,
  name: string,
  payoutAmount: number,
): SettlementParticipant {
  return {
    memberId,
    name,
    payoutAmount,
    adminPaid: false,
    adminPaidAt: null,
    memberReceived: false,
    memberReceivedAt: null,
    paidAmount: 0,
    adjustmentAmount: 0,
    adjustmentType: "none",
    returnAmount: 0,
    memberReturnConfirmed: false,
    memberReturnConfirmedAt: null,
    adminReturnConfirmed: false,
    adminReturnConfirmedAt: null,
    additionalAmount: 0,
    additionalAdminPaid: false,
    additionalAdminPaidAt: null,
    additionalMemberReceived: false,
    additionalMemberReceivedAt: null,
    personalStatus: "pending_payment",
  }
}

export function derivePersonalStatusAfterPayment(p: SettlementParticipant): SettlementPersonalStatus {
  if (p.adjustmentType === "return") {
    if (p.adminReturnConfirmed && p.memberReturnConfirmed) return "return_completed"
    if (p.adminReturnConfirmed || p.memberReturnConfirmed) return "return_in_progress"
    return "return_required"
  }
  if (p.adjustmentType === "additional") {
    if (isPayoutFullySettled(p)) return "additional_completed"
    if (!isPayoutFullyAdminConfirmed(p)) return "additional_required"
    return "additional_awaiting_receipt"
  }
  if (!p.adminPaid) return "pending_payment"
  if (!p.memberReceived) return "awaiting_receipt"
  return "completed"
}

export function computeOverallStatus(
  participants: SettlementParticipant[],
): SettlementOverallStatus {
  if (participants.length === 0) return "active"

  const hasOpenAdjustment = participants.some((p) =>
    [
      "return_required",
      "return_in_progress",
      "additional_required",
      "additional_awaiting_receipt",
      "pending_payment",
      "awaiting_receipt",
    ].includes(p.personalStatus),
  )

  if (hasOpenAdjustment) {
    const onlyUnpaid = participants.every(
      (p) => p.personalStatus === "pending_payment" && p.adjustmentType === "none",
    )
    if (onlyUnpaid) return "active"
    return "revision_in_progress"
  }

  const allTerminal = participants.every((p) => isParticipantFullySettled(p))
  return allTerminal ? "completed" : "active"
}

function snapshotFromSettlement(settlement: Settlement): SettlementRevisionSnapshot {
  return {
    revision: settlement.revision,
    participantCount: settlement.participants.length,
    perPersonAmount: settlement.perPersonAmount,
    guildShareFinal: settlement.guildShareFinal,
    distributableAmount: settlement.distributableAmount,
    remainder: settlement.remainder,
    participants: settlement.participants.map((p) => ({
      memberId: p.memberId,
      name: p.name,
      payoutAmount: p.payoutAmount,
      paidAmount: getPaidAmount(p),
      adminPaid: p.adminPaid,
      memberReceived: p.memberReceived,
    })),
  }
}

function applyRemovedParticipant(
  existing: SettlementParticipant,
): { participant: SettlementParticipant; adjustment: SettlementMemberAdjustmentLog } {
  const previousPaidAmount = getPaidAmount(existing)

  if (!existing.adminPaid || previousPaidAmount <= 0) {
    return {
      participant: {
        ...existing,
        payoutAmount: 0,
        adjustmentAmount: 0,
        adjustmentType: "none",
        returnAmount: 0,
        additionalAmount: 0,
        personalStatus: existing.adminPaid ? "completed" : "pending_payment",
      },
      adjustment: {
        memberId: existing.memberId,
        name: existing.name,
        previousPaidAmount,
        newPayoutAmount: 0,
        adjustmentAmount: 0,
        adjustmentType: "none",
      },
    }
  }

  const returnAmount = previousPaidAmount
  const participant: SettlementParticipant = {
    ...existing,
    payoutAmount: 0,
    adjustmentAmount: -returnAmount,
    adjustmentType: "return",
    returnAmount,
    memberReturnConfirmed: false,
    memberReturnConfirmedAt: null,
    adminReturnConfirmed: false,
    adminReturnConfirmedAt: null,
    additionalAmount: 0,
    additionalAdminPaid: false,
    additionalAdminPaidAt: null,
    additionalMemberReceived: false,
    additionalMemberReceivedAt: null,
    personalStatus: "return_required",
  }
  return {
    participant,
    adjustment: {
      memberId: existing.memberId,
      name: existing.name,
      previousPaidAmount,
      newPayoutAmount: 0,
      adjustmentAmount: -returnAmount,
      adjustmentType: "return",
    },
  }
}

function applyRevisionToParticipant(
  existing: SettlementParticipant | undefined,
  newPayout: number,
  attendee: AttendeeInput,
): { participant: SettlementParticipant; adjustment: SettlementMemberAdjustmentLog } {
  if (!existing) {
    const participant = createInitialParticipant(attendee.memberId, attendee.name, newPayout)
    participant.adjustmentType = "new_payout"
    participant.adjustmentAmount = newPayout
    participant.personalStatus = "pending_payment"
    return {
      participant,
      adjustment: {
        memberId: attendee.memberId,
        name: attendee.name,
        previousPaidAmount: 0,
        newPayoutAmount: newPayout,
        adjustmentAmount: newPayout,
        adjustmentType: "new_payout",
      },
    }
  }

  const previousPaidAmount = getPaidAmount(existing)
  const wasPaid = existing.adminPaid

  if (!wasPaid) {
    const participant: SettlementParticipant = {
      ...existing,
      name: attendee.name,
      payoutAmount: newPayout,
      adjustmentAmount: 0,
      adjustmentType: "none",
      returnAmount: 0,
      additionalAmount: 0,
      personalStatus: "pending_payment",
    }
    return {
      participant,
      adjustment: {
        memberId: attendee.memberId,
        name: attendee.name,
        previousPaidAmount: 0,
        newPayoutAmount: newPayout,
        adjustmentAmount: 0,
        adjustmentType: "none",
      },
    }
  }

  const adjustmentAmount = newPayout - previousPaidAmount

  if (adjustmentAmount < 0) {
    const returnAmount = -adjustmentAmount
    const participant: SettlementParticipant = {
      ...existing,
      name: attendee.name,
      payoutAmount: newPayout,
      adjustmentAmount,
      adjustmentType: "return",
      returnAmount,
      memberReturnConfirmed: false,
      memberReturnConfirmedAt: null,
      adminReturnConfirmed: false,
      adminReturnConfirmedAt: null,
      additionalAmount: 0,
      additionalAdminPaid: false,
      additionalAdminPaidAt: null,
      additionalMemberReceived: false,
      additionalMemberReceivedAt: null,
      personalStatus: "return_required",
    }
    return {
      participant,
      adjustment: {
        memberId: attendee.memberId,
        name: attendee.name,
        previousPaidAmount,
        newPayoutAmount: newPayout,
        adjustmentAmount,
        adjustmentType: "return",
      },
    }
  }

  if (adjustmentAmount > 0) {
    const participant: SettlementParticipant = {
      ...existing,
      name: attendee.name,
      payoutAmount: newPayout,
      adjustmentAmount,
      adjustmentType: "additional",
      additionalAmount: adjustmentAmount,
      additionalAdminPaid: false,
      additionalAdminPaidAt: null,
      additionalMemberReceived: false,
      additionalMemberReceivedAt: null,
      returnAmount: 0,
      memberReturnConfirmed: false,
      adminReturnConfirmed: false,
      personalStatus: "additional_required",
    }
    return {
      participant,
      adjustment: {
        memberId: attendee.memberId,
        name: attendee.name,
        previousPaidAmount,
        newPayoutAmount: newPayout,
        adjustmentAmount,
        adjustmentType: "additional",
      },
    }
  }

  const participant: SettlementParticipant = {
    ...existing,
    name: attendee.name,
    payoutAmount: newPayout,
    adjustmentAmount: 0,
    adjustmentType: "none",
    personalStatus: derivePersonalStatusAfterPayment({
      ...existing,
      payoutAmount: newPayout,
      adjustmentType: "none",
    }),
  }
  return {
    participant,
    adjustment: {
      memberId: attendee.memberId,
      name: attendee.name,
      previousPaidAmount,
      newPayoutAmount: newPayout,
      adjustmentAmount: 0,
      adjustmentType: "none",
    },
  }
}

export function reviseSettlementParticipants(
  settlement: Settlement,
  attendees: AttendeeInput[],
  reason: string,
): Settlement {
  const calc = calcSettlement({
    totalRevenue: settlement.totalRevenue,
    guildShareInput: settlement.guildShareInput,
    participantCount: attendees.length,
  })

  const snapshot = snapshotFromSettlement(settlement)
  const memberAdjustments: SettlementMemberAdjustmentLog[] = []
  const attendeeIds = new Set(attendees.map((a) => a.memberId))

  const participants: SettlementParticipant[] = attendees.map((a) => {
    const existing = settlement.participants.find((p) => p.memberId === a.memberId)
    const { participant, adjustment } = applyRevisionToParticipant(
      existing,
      calc.perPersonAmount,
      a,
    )
    memberAdjustments.push(adjustment)
    return participant
  })

  for (const existing of settlement.participants) {
    if (attendeeIds.has(existing.memberId)) continue
    const { participant, adjustment } = applyRemovedParticipant(existing)
    participants.push(participant)
    memberAdjustments.push(adjustment)
  }

  const addedMemberIds = attendees
    .filter((a) => !settlement.participants.some((p) => p.memberId === a.memberId))
    .map((a) => a.memberId)
  const removedMemberIds = settlement.participants
    .filter((p) => !attendeeIds.has(p.memberId))
    .map((p) => p.memberId)

  const revisionLog: SettlementRevisionLog = {
    id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    revision: settlement.revision + 1,
    at: Date.now(),
    reason: [
      reason.trim(),
      addedMemberIds.length > 0 ? `추가 ${addedMemberIds.length}명` : "",
      removedMemberIds.length > 0 ? `제외 ${removedMemberIds.length}명` : "",
    ]
      .filter(Boolean)
      .join(" · "),
    beforeParticipantCount: settlement.participants.length,
    afterParticipantCount: attendees.length,
    beforePerPersonAmount: settlement.perPersonAmount,
    afterPerPersonAmount: calc.perPersonAmount,
    beforeGuildShareFinal: settlement.guildShareFinal,
    afterGuildShareFinal: calc.guildShareFinal,
    memberAdjustments,
  }

  const next: Settlement = {
    ...settlement,
    revision: settlement.revision + 1,
    guildShareFinal: calc.guildShareFinal,
    distributableAmount: calc.distributableAmount,
    perPersonAmount: calc.perPersonAmount,
    remainder: calc.remainder,
    participants,
    revisionSnapshots: [...settlement.revisionSnapshots, snapshot],
    revisionLogs: [...settlement.revisionLogs, revisionLog],
    overallStatus: "revision_in_progress",
  }

  next.overallStatus = computeOverallStatus(next.participants)
  return next
}

export function onAdminPaymentConfirmed(p: SettlementParticipant): SettlementParticipant {
  const next = {
    ...p,
    adminPaid: true,
    adminPaidAt: Date.now(),
    paidAmount: p.payoutAmount,
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onMemberReceiptConfirmed(p: SettlementParticipant): SettlementParticipant {
  if (p.adjustmentType === "additional") {
    if (!isPayoutFullyAdminConfirmed(p)) return p

    if (p.memberReceived && !p.additionalMemberReceived) {
      const next = {
        ...p,
        additionalMemberReceived: true,
        additionalMemberReceivedAt: Date.now(),
      }
      next.personalStatus = derivePersonalStatusAfterPayment(next)
      return next
    }

    if (!p.memberReceived) {
      const now = Date.now()
      const next = {
        ...p,
        memberReceived: true,
        memberReceivedAt: now,
        additionalMemberReceived: true,
        additionalMemberReceivedAt: now,
      }
      next.personalStatus = derivePersonalStatusAfterPayment(next)
      return next
    }

    return p
  }

  const next = {
    ...p,
    memberReceived: true,
    memberReceivedAt: Date.now(),
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onMemberReturnConfirmed(p: SettlementParticipant): SettlementParticipant {
  const next = {
    ...p,
    memberReturnConfirmed: true,
    memberReturnConfirmedAt: Date.now(),
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onAdminReturnConfirmed(p: SettlementParticipant): SettlementParticipant {
  const next = {
    ...p,
    adminReturnConfirmed: true,
    adminReturnConfirmedAt: Date.now(),
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onAdditionalAdminPaid(p: SettlementParticipant): SettlementParticipant {
  const next = {
    ...p,
    additionalAdminPaid: true,
    additionalAdminPaidAt: Date.now(),
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onAdminReturnConfirmationCancelled(
  p: SettlementParticipant,
): SettlementParticipant {
  const next = {
    ...p,
    adminReturnConfirmed: false,
    adminReturnConfirmedAt: null,
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onAdminPaymentConfirmationCancelled(
  p: SettlementParticipant,
): SettlementParticipant {
  const next = {
    ...p,
    adminPaid: false,
    adminPaidAt: null,
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function onAdditionalAdminPaymentConfirmationCancelled(
  p: SettlementParticipant,
): SettlementParticipant {
  const next = {
    ...p,
    additionalAdminPaid: false,
    additionalAdminPaidAt: null,
  }
  next.personalStatus = derivePersonalStatusAfterPayment(next)
  return next
}

export function isParticipantFullySettled(p: SettlementParticipant): boolean {
  if (p.adjustmentType === "return") {
    return p.personalStatus === "return_completed"
  }
  if (p.adjustmentType === "additional") {
    return isPayoutFullySettled(p)
  }
  return p.personalStatus === "completed"
}

export function isSettlementComplete(adminPaid: boolean, memberReceived: boolean): boolean {
  return adminPaid && memberReceived
}

/** 테스트/검증용 — 시나리오 A~E */
export function runSettlementRevisionTests(): { ok: boolean; results: string[] } {
  const results: string[] = []
  let ok = true

  function assert(label: string, cond: boolean) {
    if (!cond) {
      ok = false
      results.push(`FAIL: ${label}`)
    } else {
      results.push(`PASS: ${label}`)
    }
  }

  function baseSettlement(participants: SettlementParticipant[]): Settlement {
    return {
      sourceType: "boss",
      sourceId: "test",
      createdAt: Date.now(),
      revision: 1,
      overallStatus: "active",
      totalRevenue: 3_500_000,
      guildShareInput: 500_000,
      guildShareFinal: 500_000,
      distributableAmount: 3_000_000,
      perPersonAmount: 1_000_000,
      remainder: 0,
      memo: "",
      displayTitle: "test",
      displaySub: "",
      participants,
      revisionSnapshots: [],
      revisionLogs: [],
      modificationLogs: [],
    }
  }

  // A: 3 paid → add 1 → returns + new payout
  const aMembers = ["a", "b", "c"].map((id) => {
    const p = createInitialParticipant(id, id, 1_000_000)
    p.adminPaid = true
    p.paidAmount = 1_000_000
    p.memberReceived = true
    p.personalStatus = "completed"
    return p
  })
  const aRev = reviseSettlementParticipants(
    baseSettlement(aMembers),
    [
      { memberId: "a", name: "a" },
      { memberId: "b", name: "b" },
      { memberId: "c", name: "c" },
      { memberId: "d", name: "관리자김" },
    ],
    "1명 추가",
  )
  assert("A: perPerson 750000", aRev.perPersonAmount === 750_000)
  assert("A: return 250000 x3", aRev.participants.filter((p) => p.returnAmount === 250_000).length === 3)
  assert("A: new member pending", aRev.participants.find((p) => p.memberId === "d")?.personalStatus === "pending_payment")

  // B: 4 paid 750k → remove 1 → additional 250k x3
  const bMembers = ["a", "b", "c", "d"].map((id) => {
    const p = createInitialParticipant(id, id, 750_000)
    p.adminPaid = true
    p.paidAmount = 750_000
    p.memberReceived = true
    p.personalStatus = "completed"
    return p
  })
  const bBase: Settlement = {
    ...baseSettlement(bMembers),
    totalRevenue: 3_500_000,
    distributableAmount: 3_000_000,
    perPersonAmount: 750_000,
    participants: bMembers,
  }
  const bRev = reviseSettlementParticipants(
    bBase,
    [
      { memberId: "a", name: "a" },
      { memberId: "b", name: "b" },
      { memberId: "c", name: "c" },
    ],
    "1명 제외",
  )
  assert("B: perPerson 1000000", bRev.perPersonAmount === 1_000_000)
  assert("B: additional 250000 x3", bRev.participants.filter((p) => p.additionalAmount === 250_000).length === 3)

  // D: 4 paid → remove 1 paid → full return for removed
  const dRemoved = bRev.participants.find((p) => p.memberId === "d")
  assert("D: removed member kept with return", dRemoved?.adjustmentType === "return")
  assert("D: removed return 750000", dRemoved?.returnAmount === 750_000)

  // C: nobody paid → only payout update
  const cMembers = ["a", "b", "c"].map((id) => createInitialParticipant(id, id, 1_000_000))
  const cRev = reviseSettlementParticipants(
    baseSettlement(cMembers),
    [
      { memberId: "a", name: "a" },
      { memberId: "b", name: "b" },
      { memberId: "c", name: "c" },
      { memberId: "d", name: "d" },
    ],
    "미지급 상태 추가",
  )
  assert("C: no returns", cRev.participants.every((p) => p.adjustmentType === "none" || p.adjustmentType === "new_payout"))
  assert("C: no return amounts", cRev.participants.every((p) => p.returnAmount === 0 && p.additionalAmount === 0))

  // E: additional cross-check scenarios (3.25M base, +3.25M additional = 6.5M final)
  const base325 = 3_250_000
  function makeAdditionalParticipant(
    memberReceived: boolean,
    additionalAdminPaid = false,
    additionalMemberReceived = false,
  ): SettlementParticipant {
    const p = createInitialParticipant("예수", "예수", base325 * 2)
    p.adminPaid = true
    p.paidAmount = base325
    p.memberReceived = memberReceived
    p.adjustmentType = "additional"
    p.additionalAmount = base325
    p.additionalAdminPaid = additionalAdminPaid
    p.additionalMemberReceived = additionalMemberReceived
    p.personalStatus = derivePersonalStatusAfterPayment(p)
    return p
  }

  // A: base fully confirmed → additional only
  const pA = makeAdditionalParticipant(true)
  const pendingA = getMemberReceiptPendingState(pA)
  assert("A: admin pending before additional pay", pendingA?.kind === "admin_pending")
  pA.additionalAdminPaid = true
  pA.personalStatus = derivePersonalStatusAfterPayment(pA)
  const pendingA2 = getMemberReceiptPendingState(pA)
  assert("A: additional only receipt", pendingA2?.kind === "additional_only")
  assert("A: confirm amount 3250000", pendingA2?.confirmAmount === base325)

  // B: base admin paid, member not received, admin paid additional → total receipt
  const pB = makeAdditionalParticipant(false, true)
  const pendingB = getMemberReceiptPendingState(pB)
  assert("B: total receipt required", pendingB?.kind === "total")
  assert("B: confirm amount 6500000", pendingB?.confirmAmount === base325 * 2)

  // C: admin paid both, member confirmed nothing → total receipt
  const pC = makeAdditionalParticipant(false, true)
  assert("C: total pending", getMemberReceiptPendingState(pC)?.kind === "total")

  // D: base confirmed, additional admin not paid
  const pD = makeAdditionalParticipant(true, false)
  assert("D: admin pending", getMemberReceiptPendingState(pD)?.kind === "admin_pending")
  assert("D: not actionable", getMemberReceiptPendingState(pD)?.actionable === false)

  // E: fully confirmed then admin cancels additional pay
  const pE = makeAdditionalParticipant(true, true, true)
  assert("E: fully settled", isPayoutFullySettled(pE))
  const pE2 = onAdditionalAdminPaymentConfirmationCancelled(pE)
  assert("E: not settled after admin cancel", !isPayoutFullySettled(pE2))
  assert("E: member additional flag kept", pE2.additionalMemberReceived === true)
  assert("E: base member kept", pE2.memberReceived === true)

  // Personal payout: additional partial / return
  const pPartial = makeAdditionalParticipant(true, true, false)
  assert("payout partial additional", getMemberReceivedPayoutAmount(pPartial) === base325)

  const pFull = makeAdditionalParticipant(true, true, true)
  assert("payout full additional", getMemberReceivedPayoutAmount(pFull) === base325 * 2)

  const pReturnBefore = createInitialParticipant("r", "r", base325)
  pReturnBefore.adminPaid = true
  pReturnBefore.paidAmount = base325 * 2
  pReturnBefore.memberReceived = true
  pReturnBefore.adjustmentType = "return"
  pReturnBefore.returnAmount = base325
  pReturnBefore.payoutAmount = base325
  pReturnBefore.personalStatus = "return_in_progress"
  assert("return before complete", getMemberReceivedPayoutAmount(pReturnBefore) === base325 * 2)

  pReturnBefore.personalStatus = "return_completed"
  pReturnBefore.adminReturnConfirmed = true
  pReturnBefore.memberReturnConfirmed = true
  assert("return after complete", getMemberReceivedPayoutAmount(pReturnBefore) === base325)

  return { ok, results }
}
