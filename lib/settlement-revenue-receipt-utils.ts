import type { SettlementRevenueReceipt } from "@/lib/settlement-revenue-receipt-types"

export function sumRevenueReceipts(receipts: SettlementRevenueReceipt[]): number {
  return receipts.reduce((s, r) => s + r.amount, 0)
}

export function computeRevenueReceivable(totalIncome: number, received: number): number {
  return Math.max(0, totalIncome - received)
}

export function validateRevenueReceiptAmount(
  totalIncome: number,
  existingReceipts: SettlementRevenueReceipt[],
  newAmount: number,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return { ok: false, message: "입금 금액은 0보다 커야 합니다." }
  }
  const cumulative = sumRevenueReceipts(existingReceipts) + newAmount
  if (cumulative > totalIncome) {
    return {
      ok: false,
      message: `누적 입금(${cumulative.toLocaleString("ko-KR")}원)이 총 수익(${totalIncome.toLocaleString("ko-KR")}원)을 초과합니다.`,
    }
  }
  return { ok: true }
}

export function validateRevisionAgainstReceipts(
  newTotalIncome: number,
  confirmedReceiptTotal: number,
): { ok: true } | { ok: false; message: string } {
  if (confirmedReceiptTotal > newTotalIncome) {
    return {
      ok: false,
      message: `확인된 입금(${confirmedReceiptTotal.toLocaleString("ko-KR")}원)이 수정 후 총 수익(${newTotalIncome.toLocaleString("ko-KR")}원)보다 큽니다. revision을 진행할 수 없습니다.`,
    }
  }
  return { ok: true }
}
