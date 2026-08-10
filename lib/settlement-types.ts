export type SettlementSourceType = "boss" | "siege"

export type SettlementAdjustmentType =
  | "none"
  | "return"
  | "additional"
  | "new_payout"

export type SettlementPersonalStatus =
  | "pending_payment"
  | "awaiting_receipt"
  | "completed"
  | "return_required"
  | "return_in_progress"
  | "return_completed"
  | "additional_required"
  | "additional_awaiting_receipt"
  | "additional_completed"

export type SettlementOverallStatus = "active" | "revision_in_progress" | "completed"

export type SettlementParticipant = {
  memberId: string
  name: string
  /** 현재 revision 기준 최종 1인 분배금 */
  payoutAmount: number
  adminPaid: boolean
  adminPaidAt: number | null
  memberReceived: boolean
  memberReceivedAt: number | null
  /** 관리자가 실제 지급 확인한 금액 */
  paidAmount: number
  adjustmentAmount: number
  adjustmentType: SettlementAdjustmentType
  returnAmount: number
  memberReturnConfirmed: boolean
  memberReturnConfirmedAt: number | null
  adminReturnConfirmed: boolean
  adminReturnConfirmedAt: number | null
  additionalAmount: number
  additionalAdminPaid: boolean
  additionalAdminPaidAt: number | null
  additionalMemberReceived: boolean
  additionalMemberReceivedAt: number | null
  personalStatus: SettlementPersonalStatus
}

export type SettlementRevisionSnapshot = {
  revision: number
  participantCount: number
  perPersonAmount: number
  guildShareFinal: number
  distributableAmount: number
  remainder: number
  participants: Array<{
    memberId: string
    name: string
    payoutAmount: number
    paidAmount: number
    adminPaid: boolean
    memberReceived: boolean
  }>
}

export type SettlementMemberAdjustmentLog = {
  memberId: string
  name: string
  previousPaidAmount: number
  newPayoutAmount: number
  adjustmentAmount: number
  adjustmentType: SettlementAdjustmentType
}

export type SettlementRevisionLog = {
  id: string
  revision: number
  at: number
  reason: string
  beforeParticipantCount: number
  afterParticipantCount: number
  beforePerPersonAmount: number
  afterPerPersonAmount: number
  beforeGuildShareFinal: number
  afterGuildShareFinal: number
  memberAdjustments: SettlementMemberAdjustmentLog[]
}

export type SettlementModificationLog = {
  id: string
  at: number
  targetMemberId: string
  targetName: string
  field: "adminPaid" | "memberReceived" | "return" | "additional"
  beforeValue: boolean
  afterValue: boolean
  reason: string
}

export type Settlement = {
  sourceType: SettlementSourceType
  sourceId: string
  createdAt: number
  revision: number
  overallStatus: SettlementOverallStatus
  totalRevenue: number
  guildShareInput: number
  guildShareFinal: number
  distributableAmount: number
  perPersonAmount: number
  remainder: number
  memo: string
  displayTitle: string
  displaySub: string
  /** Phase 9a snapshot — null/undefined = legacy settlement */
  roundingUnit?: number
  roundingPolicy?: string
  guildShareLedgerAmount?: number
  guildShareSubThousand?: number
  participants: SettlementParticipant[]
  revisionSnapshots: SettlementRevisionSnapshot[]
  revisionLogs: SettlementRevisionLog[]
  modificationLogs: SettlementModificationLog[]
}

export type SettlementSummary = {
  total: number
  adminPaid: number
  memberReceived: number
  finalComplete: number
  unconfirmed: number
  returnPending: number
  additionalPending: number
  revisionInProgress: boolean
}

export function makeSettlementKey(sourceType: SettlementSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}`
}

export function parseSettlementKey(key: string): { sourceType: SettlementSourceType; sourceId: string } {
  const [sourceType, ...rest] = key.split(":")
  return {
    sourceType: sourceType as SettlementSourceType,
    sourceId: rest.join(":"),
  }
}

export type PendingReceiptItem = {
  key: string
  sourceType: SettlementSourceType
  sourceId: string
  displayTitle: string
  displaySub: string
  /** 혈원이 이번에 확인할 금액 (0이면 버튼 비활성) */
  confirmAmount: number
  finalAmount: number
  basePaidAmount: number
  additionalAmount: number
  baseConfirmed: boolean
  adminPaidCumulative: number
  memberConfirmedCumulative: number
  participant: SettlementParticipant
  kind: "initial" | "additional_only" | "total" | "admin_pending"
  actionable: boolean
}

export type PendingReturnItem = {
  key: string
  sourceType: SettlementSourceType
  sourceId: string
  displayTitle: string
  displaySub: string
  participant: SettlementParticipant
  previousPaidAmount: number
  newPayoutAmount: number
  returnAmount: number
}

export type MemberSettlementItem = {
  sourceType: SettlementSourceType
  sourceId: string
  settlement: Settlement
  participant: SettlementParticipant
}

export const SETTLEMENT_PERSONAL_STATUS_LABELS: Record<SettlementPersonalStatus, string> = {
  pending_payment: "지급 대기",
  awaiting_receipt: "수령 확인 대기",
  completed: "완료",
  return_required: "반환 필요",
  return_in_progress: "반환 확인 중",
  return_completed: "반환 완료",
  additional_required: "추가 지급 필요",
  additional_awaiting_receipt: "추가 수령 확인 대기",
  additional_completed: "추가 지급 완료",
}

export const SETTLEMENT_OVERALL_STATUS_LABELS: Record<SettlementOverallStatus, string> = {
  active: "정산 진행 중",
  revision_in_progress: "정산 수정 중",
  completed: "처리 완료",
}
