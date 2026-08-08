export type DuesPaymentStatus = "UNPAID" | "PAYMENT_REPORTED" | "PAID"

export type DuesBillItem = {
  memberId: string
  nickname: string
  status: DuesPaymentStatus
  ledgerEntryId: string | null
}

export type DuesChangeLog = {
  id: string
  memberId: string
  nickname: string
  oldStatus: DuesPaymentStatus
  newStatus: DuesPaymentStatus
  memo: string
  changedAt: number
}

export type DuesBill = {
  id: string
  yearMonth: string
  title: string
  amountPerMember: number
  dueDate: string
  memo: string
  createdAt: number
  /** 부과 시점 활동 혈원 스냅샷 */
  targetMemberIds: string[]
  items: Record<string, DuesBillItem>
  changeLogs: DuesChangeLog[]
}

export const DUES_PAYMENT_STATUS_LABELS: Record<DuesPaymentStatus, string> = {
  UNPAID: "미납",
  PAYMENT_REPORTED: "납부신고",
  PAID: "납부완료",
}

export function makeDuesBillId(yearMonth: string): string {
  return `dues-${yearMonth}`
}

export function formatYearMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-")
  return `${y}년 ${parseInt(m, 10)}월`
}
