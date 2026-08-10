"use client"

import { useMemo } from "react"
import { Wallet, CalendarCheck, ChevronRight, RotateCcw } from "lucide-react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { ParticipationCheckCard } from "@/components/participation-check-card"
import { SiegeSurveyCard } from "@/components/siege-survey-card"
import { useParticipation } from "@/components/participation-context"
import { useSiege } from "@/components/siege-context"
import { useSettlement } from "@/components/settlement-context"
import { useDues } from "@/components/dues-context"
import { useNavigation } from "@/components/navigation-context"
import { useCurrentMemberId } from "@/components/auth-context"
import { formatWon } from "@/lib/guild-data"
import type { PendingReceiptItem, SettlementSourceType } from "@/lib/settlement-types"
import type { PendingManagementFeeItem } from "@/lib/settlement-management-payment-types"

const MAX_VISIBLE = 3

type CompactItem =
  | {
      kind: "payout"
      receipt: PendingReceiptItem
    }
  | {
      kind: "management_fee"
      item: PendingManagementFeeItem
    }
  | {
      kind: "return"
      sourceType: SettlementSourceType
      sourceId: string
      title: string
      sub: string
      previousPaid: number
      newPayout: number
      returnAmount: number
      memberReturnConfirmed: boolean
      adminReturnConfirmed: boolean
    }
  | { kind: "dues"; billId: string; title: string; amount: number; dueDate: string; dueDateLabel: string }

export function HomePendingSection() {
  const { getOpenCheck, hasJoined: hasJoinedBoss } = useParticipation()
  const { getActiveSurveySiege, needsSurveyResponse } = useSiege()
  const {
    getPendingReceipts,
    getPendingManagementFees,
    getPendingReturns,
    confirmMemberReceipt,
    confirmManagementMemberReceipt,
    confirmMemberReturn,
  } = useSettlement()
  const { getUnpaidBillsForMember } = useDues()
  const { navigate } = useNavigation()

  const memberId = useCurrentMemberId()
  const pendingReceipts = getPendingReceipts(memberId)
  const pendingManagementFees = getPendingManagementFees(memberId)
  const pendingReturns = getPendingReturns(memberId)
  const unpaidBills = getUnpaidBillsForMember(memberId)
  const openBossCheck = getOpenCheck()
  const activeSurvey = getActiveSurveySiege()

  const bossParticipationPending =
    !!openBossCheck && !hasJoinedBoss(openBossCheck.slot.id, memberId)
  const siegeSurveyPending =
    !!activeSurvey && needsSurveyResponse(activeSurvey.id, memberId)

  const compactItems = useMemo<CompactItem[]>(() => {
    const items: CompactItem[] = []

    for (const ret of pendingReturns) {
      items.push({
        kind: "return",
        sourceType: ret.sourceType,
        sourceId: ret.sourceId,
        title: ret.displayTitle,
        sub: ret.displaySub,
        previousPaid: ret.previousPaidAmount,
        newPayout: ret.newPayoutAmount,
        returnAmount: ret.returnAmount,
        memberReturnConfirmed: ret.participant.memberReturnConfirmed,
        adminReturnConfirmed: ret.participant.adminReturnConfirmed,
      })
    }

    for (const receipt of pendingReceipts) {
      items.push({ kind: "payout", receipt })
    }

    for (const mgmt of pendingManagementFees) {
      items.push({ kind: "management_fee", item: mgmt })
    }

    for (const bill of unpaidBills) {
      const [, m, d] = bill.dueDate.split("-")
      items.push({
        kind: "dues",
        billId: bill.id,
        title: bill.title,
        amount: bill.amountPerMember,
        dueDate: bill.dueDate,
        dueDateLabel: `${parseInt(m, 10)}월 ${parseInt(d, 10)}일`,
      })
    }

    return items
  }, [pendingReceipts, pendingManagementFees, pendingReturns, unpaidBills])

  const actionCount =
    compactItems.length + (siegeSurveyPending ? 1 : 0) + (bossParticipationPending ? 1 : 0)
  const visibleCompact = compactItems.slice(0, MAX_VISIBLE)
  const overflowCount = Math.max(0, actionCount - MAX_VISIBLE)

  if (actionCount === 0) return null

  function handleReceipt(sourceType: SettlementSourceType, sourceId: string) {
    confirmMemberReceipt(sourceType, sourceId)
  }

  function handleReturn(sourceType: SettlementSourceType, sourceId: string) {
    void (async () => {
      const r = await confirmMemberReturn(sourceType, sourceId)
      if (!r.ok) alert(r.message)
    })()
  }

  function handleManagementReceipt(sourceType: SettlementSourceType, sourceId: string) {
    void (async () => {
      const r = await confirmManagementMemberReceipt(sourceType, sourceId)
      if (!r.ok) alert(r.message)
    })()
  }

  return (
    <div className="mb-4">
      <SectionTitle
        action={
          <Badge tone="warning" className="tabular-nums">
            {actionCount}건
          </Badge>
        }
      >
        확인할 항목
      </SectionTitle>

      <div className="flex flex-col gap-2.5">
        {visibleCompact.map((item) => {
          if (item.kind === "return") {
            const awaitingAdmin =
              item.memberReturnConfirmed && !item.adminReturnConfirmed
            return (
              <Card
                key={`return-${item.sourceType}-${item.sourceId}`}
                className="overflow-hidden border-warning/30 bg-gradient-to-br from-warning/10 to-card"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
                    <RotateCcw className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-warning">
                      {awaitingAdmin ? "관리자 확인 대기" : "반환 필요"}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{item.title}</p>
                    {item.sub && <p className="text-xs text-muted-foreground">{item.sub}</p>}
                    <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-warning">
                      반환금 {formatWon(item.returnAmount)}
                    </p>
                  </div>
                </div>
                {!item.memberReturnConfirmed ? (
                  <button
                    type="button"
                    onClick={() => handleReturn(item.sourceType, item.sourceId)}
                    className="mt-3 w-full rounded-xl bg-warning py-2.5 text-sm font-semibold text-warning-foreground"
                  >
                    반환 완료 확인
                  </button>
                ) : (
                  <p className="mt-3 rounded-xl border border-warning/30 bg-warning/5 py-2.5 text-center text-sm font-medium text-warning">
                    반환 확인 완료 · 관리자 수령 확인 대기
                  </p>
                )}
              </Card>
            )
          }

          if (item.kind === "payout") {
            return (
              <PayoutPendingCard
                key={`payout-${item.receipt.sourceType}-${item.receipt.sourceId}-${item.receipt.kind}`}
                receipt={item.receipt}
                onConfirm={() => handleReceipt(item.receipt.sourceType, item.receipt.sourceId)}
              />
            )
          }

          if (item.kind === "management_fee") {
            return (
              <ManagementFeePendingCard
                key={`mgmt-${item.item.sourceType}-${item.item.sourceId}`}
                item={item.item}
                onConfirm={() => handleManagementReceipt(item.item.sourceType, item.item.sourceId)}
              />
            )
          }

          return (
            <Card
              key={`dues-${item.billId}`}
              className="overflow-hidden border-destructive/25 bg-gradient-to-br from-destructive/10 to-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
                    <CalendarCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-medium text-destructive">혈비 납부 필요</p>
                    <p className="mt-0.5 text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
                      {formatWon(item.amount)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      납부기한 {item.dueDateLabel}
                    </p>
                  </div>
                </div>
                <Badge tone="danger">미납</Badge>
              </div>
            </Card>
          )
        })}

        {overflowCount > 0 && (
          <button
            type="button"
            onClick={() => navigate("records")}
            className="flex items-center justify-center gap-1 py-2 text-xs font-medium text-primary"
          >
            외 {overflowCount}건 · 전체 보기
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}

        {siegeSurveyPending && <SiegeSurveyCard embedded />}
        {bossParticipationPending && <ParticipationCheckCard embedded />}
      </div>
    </div>
  )
}

function PayoutPendingCard({
  receipt,
  onConfirm,
}: {
  receipt: PendingReceiptItem
  onConfirm: () => void
}) {
  const isSiege = receipt.sourceType === "siege"

  const titleLabel =
    receipt.kind === "admin_pending"
      ? "추가 지급 대기"
      : receipt.kind === "additional_only"
        ? "추가 분배금 수령 확인"
        : receipt.kind === "total"
          ? "분배금 수령 확인"
          : isSiege
            ? "공성 분배금 수령 확인"
            : "분배금 수령 확인"

  const buttonLabel =
    receipt.kind === "additional_only"
      ? `추가 ${formatWon(receipt.confirmAmount)} 수령했습니다`
      : receipt.kind === "total"
        ? `총 ${formatWon(receipt.confirmAmount)} 수령했습니다`
        : "수령했습니다"

  return (
    <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/10 to-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-primary">{titleLabel}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{receipt.displayTitle}</p>
          {receipt.displaySub && (
            <p className="text-xs text-muted-foreground">{receipt.displaySub}</p>
          )}

          {receipt.kind === "additional_only" ? (
            <>
              <p className="mt-1 text-[11px] text-muted-foreground">
                최종 정산 {formatWon(receipt.finalAmount)}
              </p>
              <p className="text-[11px] text-success">
                기존 수령 완료 {formatWon(receipt.basePaidAmount)}
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                추가 수령 필요 {formatWon(receipt.confirmAmount)}
              </p>
            </>
          ) : receipt.kind === "total" ? (
            <>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                최종 정산금 {formatWon(receipt.finalAmount)}
              </p>
              <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                <p>기존 지급분 {formatWon(receipt.basePaidAmount)}</p>
                {receipt.additionalAmount > 0 && (
                  <p>추가 지급분 {formatWon(receipt.additionalAmount)}</p>
                )}
                <p className="font-medium text-foreground">
                  확인할 총 수령액 {formatWon(receipt.confirmAmount)}
                </p>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">관리자 지급 완료</p>
            </>
          ) : receipt.kind === "admin_pending" ? (
            <>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                최종 정산 {formatWon(receipt.finalAmount)}
              </p>
              <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                <p>지급 완료 {formatWon(receipt.adminPaidCumulative)}</p>
                {receipt.additionalAmount > 0 && (
                  <p>지급 예정 {formatWon(receipt.additionalAmount)}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                {formatWon(receipt.confirmAmount)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">관리자 지급 완료</p>
            </>
          )}
        </div>
      </div>

      {receipt.actionable ? (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {buttonLabel}
        </button>
      ) : (
        <p className="mt-3 rounded-xl border border-primary/30 bg-primary/5 py-2.5 text-center text-sm font-medium text-primary">
          관리자 추가 지급 확인 대기
        </p>
      )}
    </Card>
  )
}

function ManagementFeePendingCard({
  item,
  onConfirm,
}: {
  item: PendingManagementFeeItem
  onConfirm: () => void
}) {
  return (
    <Card className="overflow-hidden border-violet-500/25 bg-gradient-to-br from-violet-500/10 to-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-400">
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-violet-600 dark:text-violet-400">
            관리비 지급 완료 · 수령 확인 필요
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{item.displayTitle}</p>
          {item.displaySub && (
            <p className="text-xs text-muted-foreground">{item.displaySub}</p>
          )}
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatWon(item.amount)}
          </p>
        </div>
      </div>
      {item.actionable ? (
        <button
          type="button"
          onClick={onConfirm}
          className="mt-3 w-full rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:bg-violet-500"
        >
          {formatWon(item.amount)} 수령 확인
        </button>
      ) : (
        <p className="mt-3 rounded-xl border border-violet-500/30 bg-violet-500/5 py-2.5 text-center text-sm font-medium text-violet-600 dark:text-violet-400">
          관리자 지급 대기
        </p>
      )}
    </Card>
  )
}
