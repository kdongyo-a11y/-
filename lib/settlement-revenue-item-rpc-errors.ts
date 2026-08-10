const RPC_ERROR_MESSAGES: Record<string, string> = {
  settlement_not_found: "정산이 없습니다.",
  receipts_exist: "입금 확인 이력이 있는 정산은 수익 항목 금액을 변경할 수 없습니다.",
  no_revenue_items: "수익 상세 항목이 없습니다.",
  incomplete_amount_batch: "금액 변경은 모든 수익 항목 금액을 한 번에 제출해야 합니다.",
  invalid_item_ids: "수익 항목을 찾을 수 없습니다.",
  amount_sum_mismatch: "수익 항목 합계가 총 수익과 일치하지 않습니다.",
  empty_amount_batch: "금액 배치 데이터가 필요합니다.",
  empty_items_batch: "수익 항목 데이터가 필요합니다.",
  revenue_items_already_exist: "수익 상세 항목이 이미 존재합니다.",
  invalid_item_row: "수익 항목 입력이 올바르지 않습니다.",
  invalid_receipt_amount: "입금 금액은 0보다 커야 합니다.",
  receipt_exceeds_total_income: "입금 합계가 총 수익을 초과합니다.",
}

export function mapFinanceRevenueRpcError(error: unknown): string | null {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: string }).message)
      : error instanceof Error
        ? error.message
        : String(error ?? "")

  for (const [code, userMessage] of Object.entries(RPC_ERROR_MESSAGES)) {
    if (message.includes(code)) return userMessage
  }
  return null
}

export const FINANCE_REVENUE_RPC_FUNCTIONS = [
  "insert_settlement_revenue_items_batch",
  "update_settlement_revenue_item_amounts",
  "insert_settlement_revenue_receipt_locked",
  "rollback_settlement_create",
] as const
