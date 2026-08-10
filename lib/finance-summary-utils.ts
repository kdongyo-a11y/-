import type { GuildCashCheckpoint, GuildCashMovement } from "@/lib/guild-cash-types"
import { computeCashBalance, isOnOrAfterCheckpointCutoff } from "@/lib/guild-cash-utils"
import type { GuildFundLedgerEntry } from "@/lib/guild-fund-utils"
import { computeGuildFundFromLedger } from "@/lib/guild-fund-utils"
import type {
  FinanceSummary,
  FinanceSummaryDuesInput,
  FinanceSummarySettlementInput,
  FinanceWorkItem,
  SettlementRevenueDetail,
} from "@/lib/finance-summary-types"
import {
  sortFinanceWorkItems,
  verifyQueueAggregateInvariant,
} from "@/lib/finance-work-item-utils"
import {
  computeRevenueReceivable,
  sumRevenueReceipts,
} from "@/lib/settlement-revenue-receipt-utils"
import type { SettlementRevenueReceipt } from "@/lib/settlement-revenue-receipt-types"

export type ComputeFinanceSummaryInput = {
  checkpoint: GuildCashCheckpoint | null
  movements: GuildCashMovement[]
  settlements: FinanceSummarySettlementInput[]
  duesMembers: FinanceSummaryDuesInput[]
  openingBalance: number
  ledgerEntries: GuildFundLedgerEntry[]
  roundingRemainder: number
}

function participantUnpaidAmount(p: FinanceSummarySettlementInput["participants"][number]): number {
  if (p.adminPaid) return 0
  if (p.adjustmentType === "return") return 0
  return Math.max(0, p.payoutAmount - p.paidAmount)
}

function additionalUnpaidAmount(p: FinanceSummarySettlementInput["participants"][number]): number {
  if (p.adjustmentType !== "additional") return 0
  if (p.additionalAdminPaid) return 0
  return p.additionalAmount
}

function returnReceivableAmount(p: FinanceSummarySettlementInput["participants"][number]): number {
  if (p.adjustmentType !== "return") return 0
  if (!p.memberReturnConfirmed || p.adminReturnConfirmed) return 0
  return p.returnAmount
}

export function computeFinanceSummary(input: ComputeFinanceSummaryInput): FinanceSummary {
  const { checkpoint } = input
  const hasCheckpoint = checkpoint != null
  const cashBalance = computeCashBalance(checkpoint, input.movements)

  const drilldown: FinanceSummary["drilldown"] = {
    duesReceivable: [],
    revenueReceivable: [],
    returnReceivable: [],
    participantPayable: [],
    additionalPayable: [],
    managementPayable: [],
  }

  const receivableQueue: FinanceWorkItem[] = []
  const payableQueue: FinanceWorkItem[] = []
  const revenueDetails: Record<string, SettlementRevenueDetail> = {}

  let duesTotal = 0
  for (const d of input.duesMembers) {
    if (d.status === "paid") continue
    if (!isOnOrAfterCheckpointCutoff(d.createdAtIso, checkpoint)) continue

    const remaining = d.amount
    duesTotal += remaining

    const item: FinanceWorkItem = {
      id: `dues:${d.billId}:${d.memberId}`,
      kind: "dues_receivable",
      occurredAt: d.createdAtIso,
      totalAmount: d.amount,
      remainingAmount: remaining,
      statusLabel: d.status === "payment_reported" ? "납부 신고" : "미납",
      title: `${d.duesMonth} 혈비`,
      subtitle: d.memberName,
      description: `${d.memberName} · ${d.duesMonth} 혈비 ${d.status === "payment_reported" ? "납부 확인 대기" : "미납"}`,
      billId: d.billId,
      duesMonth: d.duesMonth,
      memberId: d.memberId,
    }

    receivableQueue.push(item)
    drilldown.duesReceivable.push({
      id: item.id,
      label: item.title,
      subLabel: item.subtitle,
      amount: remaining,
    })
  }

  let revenueTotal = 0
  let returnTotal = 0
  let participantTotal = 0
  let additionalTotal = 0
  let managementTotal = 0

  for (const s of input.settlements) {
    if (!isOnOrAfterCheckpointCutoff(s.createdAtIso, checkpoint)) continue

    const receivable = computeRevenueReceivable(s.totalIncome, s.receivedAmount)
    revenueDetails[s.settlementDbId] = {
      settlementDbId: s.settlementDbId,
      sourceType: s.sourceType,
      sourceId: s.sourceId,
      displayTitle: s.displayTitle,
      displaySub: s.displaySub,
      occurredAt: s.createdAtIso,
      totalIncome: s.totalIncome,
      receivedAmount: s.receivedAmount,
      receivableAmount: receivable,
      items: s.revenueItems,
      receipts: s.receipts,
    }

    if (receivable > 0) {
      revenueTotal += receivable
      const item: FinanceWorkItem = {
        id: `revenue:${s.settlementDbId}`,
        kind: "revenue_receivable",
        occurredAt: s.createdAtIso,
        totalAmount: s.totalIncome,
        remainingAmount: receivable,
        statusLabel: "미입금",
        title: s.displayTitle,
        subtitle: s.displaySub,
        description: `${s.displayTitle} · 총 ${s.totalIncome.toLocaleString("ko-KR")}원 중 ${s.receivedAmount.toLocaleString("ko-KR")}원 입금`,
        settlementDbId: s.settlementDbId,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
      }
      receivableQueue.push(item)
      drilldown.revenueReceivable.push({
        id: s.settlementDbId,
        label: s.displayTitle,
        subLabel: s.displaySub,
        amount: receivable,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
      })
    }

    for (const p of s.participants) {
      const ret = returnReceivableAmount(p)
      if (ret > 0) {
        returnTotal += ret
        const item: FinanceWorkItem = {
          id: `return:${s.settlementDbId}:${p.memberId}`,
          kind: "return_receivable",
          occurredAt: s.createdAtIso,
          totalAmount: p.returnAmount,
          remainingAmount: ret,
          statusLabel: "반환 대기",
          title: s.displayTitle,
          subtitle: `${p.name} 반환`,
          description: `${p.name} · ${s.displayTitle} 과지급 반환 ${ret.toLocaleString("ko-KR")}원`,
          settlementDbId: s.settlementDbId,
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          memberId: p.memberId,
        }
        receivableQueue.push(item)
        drilldown.returnReceivable.push({
          id: item.id,
          label: s.displayTitle,
          subLabel: `${p.name} 반환`,
          amount: ret,
        })
      }

      const part = participantUnpaidAmount(p)
      if (part > 0) {
        participantTotal += part
        const item: FinanceWorkItem = {
          id: `participant:${s.settlementDbId}:${p.memberId}`,
          kind: "participant_payable",
          occurredAt: s.createdAtIso,
          totalAmount: p.payoutAmount,
          remainingAmount: part,
          statusLabel: "미지급",
          title: s.displayTitle,
          subtitle: p.name,
          description: `${p.name} · ${s.displayTitle} 분배금 ${part.toLocaleString("ko-KR")}원`,
          settlementDbId: s.settlementDbId,
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          memberId: p.memberId,
        }
        payableQueue.push(item)
        drilldown.participantPayable.push({
          id: item.id,
          label: s.displayTitle,
          subLabel: p.name,
          amount: part,
        })
      }

      const add = additionalUnpaidAmount(p)
      if (add > 0) {
        additionalTotal += add
        const item: FinanceWorkItem = {
          id: `additional:${s.settlementDbId}:${p.memberId}`,
          kind: "additional_payable",
          occurredAt: s.createdAtIso,
          totalAmount: p.additionalAmount,
          remainingAmount: add,
          statusLabel: "추가 미지급",
          title: s.displayTitle,
          subtitle: `${p.name} 추가지급`,
          description: `${p.name} · ${s.displayTitle} 추가지급 ${add.toLocaleString("ko-KR")}원`,
          settlementDbId: s.settlementDbId,
          sourceType: s.sourceType,
          sourceId: s.sourceId,
          memberId: p.memberId,
        }
        payableQueue.push(item)
        drilldown.additionalPayable.push({
          id: item.id,
          label: s.displayTitle,
          subLabel: `${p.name} 추가지급`,
          amount: add,
        })
      }
    }

    for (const mp of s.managementPayments) {
      if (mp.adminPaid || mp.amount <= 0) continue
      managementTotal += mp.amount
      const item: FinanceWorkItem = {
        id: `mgmt:${s.settlementDbId}:${mp.memberId}`,
        kind: "management_payable",
        occurredAt: s.createdAtIso,
        totalAmount: mp.amount,
        remainingAmount: mp.amount,
        statusLabel: "관리비 미지급",
        title: s.displayTitle,
        subtitle: mp.snapshotNickname,
        description: `${mp.snapshotNickname} · ${s.displayTitle} 관리비 ${mp.amount.toLocaleString("ko-KR")}원`,
        settlementDbId: s.settlementDbId,
        sourceType: s.sourceType,
        sourceId: s.sourceId,
        memberId: mp.memberId,
      }
      payableQueue.push(item)
      drilldown.managementPayable.push({
        id: item.id,
        label: s.displayTitle,
        subLabel: mp.snapshotNickname,
        amount: mp.amount,
      })
    }
  }

  const receivables = duesTotal + revenueTotal + returnTotal
  const payables = participantTotal + additionalTotal + managementTotal
  const availableFund = cashBalance - payables
  const projectedAvailableFund = cashBalance + receivables - payables
  const legacyGuildFund = computeGuildFundFromLedger(input.openingBalance, input.ledgerEntries)

  const sortedReceivableQueue = sortFinanceWorkItems(receivableQueue, "remaining_desc")
  const sortedPayableQueue = sortFinanceWorkItems(payableQueue, "remaining_desc")

  const invariant = verifyQueueAggregateInvariant({
    receivableQueue: sortedReceivableQueue,
    payableQueue: sortedPayableQueue,
    receivableBreakdown: { dues: duesTotal, revenue: revenueTotal, return: returnTotal },
    payableBreakdown: {
      participant: participantTotal,
      additional: additionalTotal,
      management: managementTotal,
    },
  })
  if (!invariant.ok) {
    throw new Error(`Finance queue invariant failed: ${invariant.message}`)
  }

  return {
    hasCheckpoint,
    checkpoint,
    cashBalance,
    receivables,
    payables,
    availableFund,
    projectedAvailableFund,
    legacyGuildFund,
    roundingRemainder: input.roundingRemainder,
    receivableBreakdown: {
      dues: duesTotal,
      revenue: revenueTotal,
      return: returnTotal,
    },
    payableBreakdown: {
      participant: participantTotal,
      additional: additionalTotal,
      management: managementTotal,
    },
    receivableQueue: sortedReceivableQueue,
    payableQueue: sortedPayableQueue,
    revenueDetails,
    drilldown,
    payablesExceedCash: payables > cashBalance,
  }
}

export function receivedAmountForSettlement(
  settlementDbId: string,
  receipts: SettlementRevenueReceipt[],
): number {
  return sumRevenueReceipts(receipts.filter((r) => r.settlementId === settlementDbId))
}
