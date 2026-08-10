import type { AdminNavState } from "@/components/admin/admin-types"
import {
  bossSlotNav,
  duesBillNav,
  financeTabNav,
  siegeDetailNav,
} from "@/components/admin/admin-nav-helpers"
import type { FinanceWorkItem, FinanceWorkItemKind } from "@/lib/finance-summary-types"
import { parseSlotId } from "@/lib/supabase/boss-mapper"

/**
 * Finance 2.0-B: set true after cash hooks exist for dues/payables/returns.
 * Until then, only revenue_receivable may run inline mutations (receipt → cash IN).
 */
export const FINANCE_WORK_QUEUE_INLINE_MUTATIONS_ENABLED = false

export function isInlineWorkQueueMutationEnabled(kind: FinanceWorkItemKind): boolean {
  if (FINANCE_WORK_QUEUE_INLINE_MUTATIONS_ENABLED) return true
  return kind === "revenue_receivable"
}

export type WorkQueueNavigateAction = {
  label: string
  nav: AdminNavState
}

function settlementNav(
  sourceType: "boss" | "siege",
  sourceId: string,
): AdminNavState | null {
  if (sourceType === "boss") {
    const parsed = parseSlotId(sourceId)
    if (!parsed) return null
    return bossSlotNav(parsed.eventDate, sourceId)
  }
  return siegeDetailNav(sourceId)
}

export function getWorkQueueNavigateAction(
  item: FinanceWorkItem,
): WorkQueueNavigateAction | null {
  switch (item.kind) {
    case "dues_receivable":
      if (item.billId) {
        return { label: "혈비 관리", nav: duesBillNav(item.billId) }
      }
      return { label: "혈비 관리", nav: financeTabNav("dues") }

    case "participant_payable":
    case "additional_payable":
      if (item.sourceType && item.sourceId) {
        const nav = settlementNav(item.sourceType, item.sourceId)
        if (nav) return { label: "정산으로 이동", nav }
      }
      return null

    case "management_payable":
      if (item.sourceType && item.sourceId) {
        const nav = settlementNav(item.sourceType, item.sourceId)
        if (nav) return { label: "관리비 지급 화면", nav }
      }
      return null

    case "return_receivable":
      if (item.sourceType && item.sourceId) {
        const nav = settlementNav(item.sourceType, item.sourceId)
        if (nav) return { label: "반환 내역 확인", nav }
      }
      return null

    default:
      return null
  }
}
