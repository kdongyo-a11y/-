import type {
  SettlementRevenueItem,
  SettlementRevenueItemInput,
  SettlementRevenueItemUpdateInput,
} from "@/lib/settlement-revenue-item-types"

export function sumRevenueItemAmounts(
  items: Array<{ amount: number }>,
): number {
  return items.reduce((s, i) => s + i.amount, 0)
}

export function validateRevenueItemsForTotalIncome(
  totalIncome: number,
  items: SettlementRevenueItemInput[],
): { ok: true } | { ok: false; message: string } {
  if (items.length === 0) return { ok: true }

  for (const item of items) {
    if (!item.description?.trim()) {
      return { ok: false, message: "수익 항목 설명을 입력해주세요." }
    }
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      return { ok: false, message: "수익 항목 금액은 0보다 커야 합니다." }
    }
    if (item.quantity != null && (!Number.isFinite(item.quantity) || item.quantity < 0)) {
      return { ok: false, message: "수량을 올바르게 입력해주세요." }
    }
    if (item.unitPrice != null && (!Number.isFinite(item.unitPrice) || item.unitPrice < 0)) {
      return { ok: false, message: "단가를 올바르게 입력해주세요." }
    }
  }

  const sum = sumRevenueItemAmounts(items)
  if (sum !== totalIncome) {
    return {
      ok: false,
      message: `수익 항목 합계(${sum.toLocaleString("ko-KR")}원)가 총 수익(${totalIncome.toLocaleString("ko-KR")}원)과 일치하지 않습니다.`,
    }
  }
  return { ok: true }
}

export function validateRevenueItemsInvariant(
  totalIncome: number,
  items: SettlementRevenueItem[],
): { ok: true } | { ok: false; message: string } {
  if (items.length === 0) return { ok: true }
  const sum = sumRevenueItemAmounts(items)
  if (sum !== totalIncome) {
    return {
      ok: false,
      message: `수익 항목 합계(${sum.toLocaleString("ko-KR")}원)가 총 수익(${totalIncome.toLocaleString("ko-KR")}원)과 일치하지 않습니다.`,
    }
  }
  return { ok: true }
}

export function canChangeRevenueItemAmount(hasReceipts: boolean): boolean {
  return !hasReceipts
}

const BATCH_AMOUNT_MESSAGE =
  "금액 변경은 모든 수익 항목 금액을 한 번에 제출해야 합니다."

export function applyRevenueItemMetadataUpdates(
  existing: SettlementRevenueItem[],
  updates: SettlementRevenueItemUpdateInput[],
): { ok: true; items: SettlementRevenueItem[] } | { ok: false; message: string } {
  for (const u of updates) {
    if (u.amount !== undefined) {
      return { ok: false, message: "금액 변경은 update_amounts 액션을 사용해주세요." }
    }
  }
  return applyRevenueItemUpdates(existing, updates, false, { allowPartialAmount: false })
}

export function applyRevenueItemAmountBatch(
  existing: SettlementRevenueItem[],
  amountBatch: Array<{ id: string; amount: number }>,
  hasReceipts: boolean,
): { ok: true; items: SettlementRevenueItem[] } | { ok: false; message: string } {
  if (!canChangeRevenueItemAmount(hasReceipts)) {
    return {
      ok: false,
      message: "입금 확인 이력이 있는 정산은 수익 항목 금액을 변경할 수 없습니다.",
    }
  }

  if (amountBatch.length !== existing.length) {
    return { ok: false, message: BATCH_AMOUNT_MESSAGE }
  }

  const existingIds = new Set(existing.map((i) => i.id))
  if (amountBatch.some((row) => !existingIds.has(row.id))) {
    return { ok: false, message: "수익 항목을 찾을 수 없습니다." }
  }

  const updates: SettlementRevenueItemUpdateInput[] = amountBatch.map((row) => ({
    id: row.id,
    amount: row.amount,
  }))

  return applyRevenueItemUpdates(existing, updates, hasReceipts, { allowPartialAmount: true })
}

export function applyRevenueItemUpdates(
  existing: SettlementRevenueItem[],
  updates: SettlementRevenueItemUpdateInput[],
  hasReceipts: boolean,
  options?: { allowPartialAmount?: boolean },
): { ok: true; items: SettlementRevenueItem[] } | { ok: false; message: string } {
  const allowPartialAmount = options?.allowPartialAmount ?? false
  const amountUpdates = updates.filter((u) => u.amount !== undefined)

  if (amountUpdates.length > 0 && !allowPartialAmount) {
    if (amountUpdates.length !== existing.length) {
      return { ok: false, message: BATCH_AMOUNT_MESSAGE }
    }
    const amountIds = new Set(amountUpdates.map((u) => u.id))
    if (existing.some((i) => !amountIds.has(i.id))) {
      return { ok: false, message: BATCH_AMOUNT_MESSAGE }
    }
  }

  const byId = new Map(existing.map((i) => [i.id, { ...i }]))

  for (const u of updates) {
    const item = byId.get(u.id)
    if (!item) return { ok: false, message: "수익 항목을 찾을 수 없습니다." }

    if (u.description !== undefined) {
      if (!u.description.trim()) return { ok: false, message: "수익 항목 설명을 입력해주세요." }
      item.description = u.description.trim()
    }
    if (u.quantity !== undefined) item.quantity = u.quantity
    if (u.unitPrice !== undefined) item.unitPrice = u.unitPrice
    if (u.memo !== undefined) item.memo = u.memo.trim()

    if (u.amount !== undefined) {
      if (!canChangeRevenueItemAmount(hasReceipts)) {
        return {
          ok: false,
          message: "입금 확인 이력이 있는 정산은 수익 항목 금액을 변경할 수 없습니다.",
        }
      }
      if (!Number.isFinite(u.amount) || u.amount <= 0) {
        return { ok: false, message: "수익 항목 금액은 0보다 커야 합니다." }
      }
      item.amount = Math.round(u.amount)
    }
  }

  return { ok: true, items: [...byId.values()].sort((a, b) => a.sortOrder - b.sortOrder) }
}
