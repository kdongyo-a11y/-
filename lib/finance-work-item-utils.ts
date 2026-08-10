import type { FinanceWorkItem, FinanceWorkItemKind, FinanceWorkQueueSort } from "@/lib/finance-summary-types"

const KIND_ORDER: Record<FinanceWorkItemKind, number> = {
  revenue_receivable: 1,
  dues_receivable: 2,
  return_receivable: 3,
  participant_payable: 4,
  management_payable: 5,
  additional_payable: 6,
}

export function sortFinanceWorkItems(
  items: FinanceWorkItem[],
  sort: FinanceWorkQueueSort = "remaining_desc",
): FinanceWorkItem[] {
  const copy = [...items]
  copy.sort((a, b) => {
    if (sort === "remaining_desc") {
      if (b.remainingAmount !== a.remainingAmount) return b.remainingAmount - a.remainingAmount
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    }
    if (sort === "newest") {
      return new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    }
    if (sort === "oldest") {
      return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    }
    if (sort === "kind") {
      const kd = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      if (kd !== 0) return kd
      return b.remainingAmount - a.remainingAmount
    }
    return 0
  })
  return copy
}

export function sumWorkItemRemaining(items: FinanceWorkItem[]): number {
  return items.reduce((s, i) => s + i.remainingAmount, 0)
}

export function sumWorkItemRemainingByKind(
  items: FinanceWorkItem[],
  kinds: FinanceWorkItemKind[],
): number {
  const set = new Set(kinds)
  return items.filter((i) => set.has(i.kind)).reduce((s, i) => s + i.remainingAmount, 0)
}

export function verifyQueueAggregateInvariant(input: {
  receivableQueue: FinanceWorkItem[]
  payableQueue: FinanceWorkItem[]
  receivableBreakdown: { dues: number; revenue: number; return: number }
  payableBreakdown: { participant: number; additional: number; management: number }
}): { ok: true } | { ok: false; message: string } {
  const duesSum = sumWorkItemRemainingByKind(input.receivableQueue, ["dues_receivable"])
  const revenueSum = sumWorkItemRemainingByKind(input.receivableQueue, ["revenue_receivable"])
  const returnSum = sumWorkItemRemainingByKind(input.receivableQueue, ["return_receivable"])
  const participantSum = sumWorkItemRemainingByKind(input.payableQueue, ["participant_payable"])
  const additionalSum = sumWorkItemRemainingByKind(input.payableQueue, ["additional_payable"])
  const managementSum = sumWorkItemRemainingByKind(input.payableQueue, ["management_payable"])

  const checks: Array<[string, number, number]> = [
    ["dues", duesSum, input.receivableBreakdown.dues],
    ["revenue", revenueSum, input.receivableBreakdown.revenue],
    ["return", returnSum, input.receivableBreakdown.return],
    ["participant", participantSum, input.payableBreakdown.participant],
    ["additional", additionalSum, input.payableBreakdown.additional],
    ["management", managementSum, input.payableBreakdown.management],
  ]

  for (const [label, sum, breakdown] of checks) {
    if (sum !== breakdown) {
      return {
        ok: false,
        message: `${label} queue sum(${sum}) != breakdown(${breakdown})`,
      }
    }
  }
  return { ok: true }
}

export const FINANCE_WORK_ITEM_KIND_LABELS: Record<FinanceWorkItemKind, string> = {
  revenue_receivable: "수익 미입금",
  dues_receivable: "혈비 미수",
  return_receivable: "반환 미수령",
  participant_payable: "혈맹원 정산",
  management_payable: "관리비",
  additional_payable: "추가지급",
}
