import type { GuildCashCheckpoint, GuildCashMovement } from "@/lib/guild-cash-types"
import { computeCashBalance, isOnOrAfterCheckpointCutoff } from "@/lib/guild-cash-utils"
import type { GuildFundLedgerEntry } from "@/lib/guild-fund-utils"
import { computeGuildFundFromLedger } from "@/lib/guild-fund-utils"
import type {
  FinanceSummary,
  FinanceSummaryDuesInput,
  FinanceSummarySettlementInput,
} from "@/lib/finance-summary-types"
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

  let duesTotal = 0
  for (const d of input.duesMembers) {
    if (d.status === "paid") continue
    if (!isOnOrAfterCheckpointCutoff(d.createdAtIso, checkpoint)) continue
    duesTotal += d.amount
    drilldown.duesReceivable.push({
      id: `${d.billId}:${d.memberId}`,
      label: `${d.duesMonth} 혈비`,
      subLabel: d.memberName,
      amount: d.amount,
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
    if (receivable > 0) {
      revenueTotal += receivable
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
        drilldown.returnReceivable.push({
          id: `${s.settlementDbId}:${p.memberId}`,
          label: s.displayTitle,
          subLabel: `${p.name} 반환`,
          amount: ret,
        })
      }

      const part = participantUnpaidAmount(p)
      if (part > 0) {
        participantTotal += part
        drilldown.participantPayable.push({
          id: `${s.settlementDbId}:${p.memberId}`,
          label: s.displayTitle,
          subLabel: p.name,
          amount: part,
        })
      }

      const add = additionalUnpaidAmount(p)
      if (add > 0) {
        additionalTotal += add
        drilldown.additionalPayable.push({
          id: `${s.settlementDbId}:${p.memberId}:add`,
          label: s.displayTitle,
          subLabel: `${p.name} 추가지급`,
          amount: add,
        })
      }
    }

    for (const mp of s.managementPayments) {
      if (mp.adminPaid || mp.amount <= 0) continue
      managementTotal += mp.amount
      drilldown.managementPayable.push({
        id: `${s.settlementDbId}:${mp.memberId}:mgmt`,
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
    drilldown,
    payablesExceedCash: payables > cashBalance,
  }
}

/** settlement + receipts rows → receivedAmount */
export function receivedAmountForSettlement(
  settlementDbId: string,
  receipts: SettlementRevenueReceipt[],
): number {
  return sumRevenueReceipts(receipts.filter((r) => r.settlementId === settlementDbId))
}
