"use client"

import { useState } from "react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import {
  SETTLEMENT_OVERALL_STATUS_LABELS,
  SETTLEMENT_PERSONAL_STATUS_LABELS,
  type Settlement,
  type SettlementParticipant,
  type SettlementSourceType,
} from "@/lib/settlement-types"
import { formatWon } from "@/lib/guild-data"
import {
  getAdminPaidCumulative,
  getBasePaidAmount,
  getFinalAmount,
  getMemberConfirmedCumulative,
  isPayoutFullySettled,
} from "@/lib/settlement-revision-utils"
import { cn } from "@/lib/utils"

type CancelKind = "return" | "payment" | "additional"

const CANCEL_DIALOG_COPY: Record<
  CancelKind,
  { title: string; message: string; confirmLabel: string }
> = {
  return: {
    title: "반환 수령 확인 취소",
    message:
      "반환 수령 확인을 취소하시겠습니까?\n혈원의 반환 완료 기록은 유지되며,\n관리자 확인 대기 상태로 돌아갑니다.",
    confirmLabel: "확인 취소",
  },
  payment: {
    title: "지급 완료 확인 취소",
    message:
      "지급 완료 확인을 취소하시겠습니까?\n혈원의 기존 수령 확인 기록은 유지됩니다.",
    confirmLabel: "확인 취소",
  },
  additional: {
    title: "추가 지급 확인 취소",
    message:
      "추가 지급 확인을 취소하시겠습니까?\n혈원의 기존 수령 확인 기록은 유지됩니다.",
    confirmLabel: "확인 취소",
  },
}

type Props = {
  settlement: Settlement
  sourceType: SettlementSourceType
  sourceId: string
  onConfirmAdminReturn: (memberId: string) => void | Promise<void>
  onCancelAdminReturn: (memberId: string) => void | Promise<void>
  onConfirmAdditionalPayment: (memberId: string) => void
  onCancelAdditionalPayment: (memberId: string) => void | Promise<void>
  onConfirmAdminPayment: (memberId: string) => void
  onCancelAdminPayment: (memberId: string) => void | Promise<void>
}

export function SettlementRevisionSummary({ settlement }: { settlement: Settlement }) {
  const latestLog = settlement.revisionLogs[settlement.revisionLogs.length - 1]
  const snapshot = settlement.revisionSnapshots[settlement.revisionSnapshots.length - 1]

  if (!latestLog || !snapshot) return null

  const returnCount = settlement.participants.filter((p) => p.adjustmentType === "return").length
  const additionalCount = settlement.participants.filter((p) => p.adjustmentType === "additional").length
  const newCount = settlement.participants.filter((p) => p.adjustmentType === "new_payout").length

  return (
    <Card className="mb-3 space-y-2 border-warning/30 bg-warning/5 text-xs">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-foreground">정산 수정 · v{settlement.revision}</p>
        <Badge tone="warning">{SETTLEMENT_OVERALL_STATUS_LABELS[settlement.overallStatus]}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
        <p>기존 참여 {latestLog.beforeParticipantCount}명</p>
        <p>최종 참여 {latestLog.afterParticipantCount}명</p>
        <p>기존 1인 {formatWon(latestLog.beforePerPersonAmount)}</p>
        <p>최종 1인 {formatWon(latestLog.afterPerPersonAmount)}</p>
      </div>
      <p className="text-[11px] text-muted-foreground">사유: {latestLog.reason}</p>
      <div className="flex flex-wrap gap-1.5">
        {returnCount > 0 && <Badge tone="warning">반환 대상 {returnCount}명</Badge>}
        {additionalCount > 0 && <Badge tone="primary">추가 지급 {additionalCount}명</Badge>}
        {newCount > 0 && <Badge tone="neutral">신규 지급 {newCount}명</Badge>}
      </div>
    </Card>
  )
}

export function SettlementParticipantRevisionList({
  settlement,
  onConfirmAdminReturn,
  onCancelAdminReturn,
  onConfirmAdditionalPayment,
  onCancelAdditionalPayment,
  onConfirmAdminPayment,
  onCancelAdminPayment,
}: Props) {
  const [pendingCancel, setPendingCancel] = useState<{
    kind: CancelKind
    memberId: string
    onConfirm: () => void | Promise<void>
  } | null>(null)

  function requestCancel(kind: CancelKind, memberId: string, onConfirm: () => void | Promise<void>) {
    setPendingCancel({ kind, memberId, onConfirm })
  }

  async function handleCancelConfirm() {
    if (!pendingCancel) return
    await pendingCancel.onConfirm()
    setPendingCancel(null)
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {settlement.participants.map((p) => (
          <ParticipantRevisionRow
            key={p.memberId}
            participant={p}
            onConfirmAdminReturn={() => onConfirmAdminReturn(p.memberId)}
            onCancelAdminReturn={() =>
              requestCancel("return", p.memberId, () => onCancelAdminReturn(p.memberId))
            }
            onConfirmAdditionalPayment={() => onConfirmAdditionalPayment(p.memberId)}
            onCancelAdditionalPayment={() =>
              requestCancel("additional", p.memberId, () => onCancelAdditionalPayment(p.memberId))
            }
            onConfirmAdminPayment={() => onConfirmAdminPayment(p.memberId)}
            onCancelAdminPayment={() =>
              requestCancel("payment", p.memberId, () => onCancelAdminPayment(p.memberId))
            }
          />
        ))}

        {settlement.revisionLogs.length > 0 && (
          <>
            <SectionTitle>정산 수정 이력</SectionTitle>
            {settlement.revisionLogs.map((log) => (
              <Card key={log.id} className="py-2.5 text-[11px]">
                <p className="font-medium">
                  v{log.revision} · {new Date(log.at).toLocaleString("ko-KR")}
                </p>
                <p className="text-muted-foreground">{log.reason}</p>
                <p className="mt-1 text-muted-foreground">
                  {log.beforeParticipantCount}명/{formatWon(log.beforePerPersonAmount)} →{" "}
                  {log.afterParticipantCount}명/{formatWon(log.afterPerPersonAmount)}
                </p>
              </Card>
            ))}
          </>
        )}
      </div>

      {pendingCancel && (
        <AdminCancelConfirmDialog
          kind={pendingCancel.kind}
          onClose={() => setPendingCancel(null)}
          onConfirm={handleCancelConfirm}
        />
      )}
    </>
  )
}

function ParticipantRevisionRow({
  participant: p,
  onConfirmAdminReturn,
  onCancelAdminReturn,
  onConfirmAdditionalPayment,
  onCancelAdditionalPayment,
  onConfirmAdminPayment,
  onCancelAdminPayment,
}: {
  participant: SettlementParticipant
  onConfirmAdminReturn: () => void
  onCancelAdminReturn: () => void
  onConfirmAdditionalPayment: () => void
  onCancelAdditionalPayment: () => void
  onConfirmAdminPayment: () => void
  onCancelAdminPayment: () => void
}) {
  const statusLabel = SETTLEMENT_PERSONAL_STATUS_LABELS[p.personalStatus]
  const tone =
    p.personalStatus.includes("return")
      ? "warning"
      : p.personalStatus.includes("additional")
        ? "primary"
        : p.personalStatus === "completed" || p.personalStatus.includes("completed")
          ? "success"
          : "neutral"

  const showPaymentActions =
    p.adjustmentType === "new_payout" || p.adjustmentType === "none"

  return (
    <Card
      className={cn(
        "py-2.5",
        p.adjustmentType === "return" && "border-warning/30 bg-warning/5",
        p.adjustmentType === "additional" && "border-primary/30 bg-primary/5",
        p.adjustmentType === "new_payout" && "border-primary/20 bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{p.name}</p>
            <Badge tone={tone}>{statusLabel}</Badge>
            {p.adjustmentType === "return" && (
              <Badge tone="warning">반환 대상</Badge>
            )}
            {p.adjustmentType === "additional" && (
              <Badge tone="primary">추가 지급</Badge>
            )}
            {p.adjustmentType === "new_payout" && (
              <Badge tone="primary">신규 지급</Badge>
            )}
          </div>
          {p.paidAmount > 0 && (
            <p className="text-[11px] text-muted-foreground">기존 지급 {formatWon(p.paidAmount)}</p>
          )}
          <p className="text-xs text-muted-foreground">최종 정산 {formatWon(p.payoutAmount)}</p>
          {p.returnAmount > 0 && (
            <p className="text-[11px] font-medium text-warning">반환 필요 {formatWon(p.returnAmount)}</p>
          )}
          {p.additionalAmount > 0 && (
            <p className="text-[11px] font-medium text-primary">추가 지급 {formatWon(p.additionalAmount)}</p>
          )}
          {(p.adjustmentType === "additional" ||
            p.adjustmentType === "new_payout" ||
            p.adjustmentType === "none") && (
            <PayoutCrossCheckSummary participant={p} />
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          {showPaymentActions && !p.adminPaid && (
            <ActionBtn label="지급완료" onClick={onConfirmAdminPayment} />
          )}
          {showPaymentActions && p.adminPaid && (
            <>
              <span className="rounded-lg border border-success/30 px-2 py-1 text-center text-[10px] font-medium text-success">
                ✓ 지급 완료
              </span>
              <CancelBtn label="지급 완료 취소" onClick={onCancelAdminPayment} />
            </>
          )}
          {p.adjustmentType === "return" && !p.adminReturnConfirmed && (
            <ActionBtn label="반환 수령 확인" onClick={onConfirmAdminReturn} />
          )}
          {p.adjustmentType === "return" && p.adminReturnConfirmed && (
            <>
              <span className="rounded-lg border border-success/30 px-2 py-1 text-center text-[10px] font-medium text-success">
                ✓ 반환 완료
              </span>
              <CancelBtn label="확인 취소" onClick={onCancelAdminReturn} />
            </>
          )}
          {p.adjustmentType === "additional" && !p.additionalAdminPaid && (
            <ActionBtn label="추가 지급 완료" onClick={onConfirmAdditionalPayment} />
          )}
          {p.adjustmentType === "additional" && p.additionalAdminPaid && (
            <>
              <span className="rounded-lg border border-success/30 px-2 py-1 text-center text-[10px] font-medium text-success">
                ✓ 추가 지급 완료
              </span>
              <CancelBtn label="확인 취소" onClick={onCancelAdditionalPayment} />
            </>
          )}
        </div>
      </div>
      {p.adjustmentType === "return" && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          혈원 반환 {p.memberReturnConfirmed ? "완료" : "대기"} · 관리자 확인{" "}
          {p.adminReturnConfirmed ? "완료" : "대기"}
        </p>
      )}
    </Card>
  )
}

function PayoutCrossCheckSummary({ participant: p }: { participant: SettlementParticipant }) {
  const finalAmount = getFinalAmount(p)
  const basePaidAmount = getBasePaidAmount(p)
  const adminPaid = getAdminPaidCumulative(p)
  const memberConfirmed = getMemberConfirmedCumulative(p)
  const fullySettled = isPayoutFullySettled(p)

  return (
    <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-background/40 p-2 text-[10px]">
      {p.adjustmentType === "additional" && (
        <>
          <CrossCheckRow
            label="기존 지급"
            adminDone={p.adminPaid}
            memberDone={p.memberReceived}
            amount={basePaidAmount}
          />
          <CrossCheckRow
            label="추가 지급"
            adminDone={p.additionalAdminPaid}
            memberDone={p.additionalMemberReceived}
            amount={p.additionalAmount}
          />
        </>
      )}
      <div className="border-t border-border/50 pt-1">
        <p className="font-medium text-foreground">최종 정산 {formatWon(finalAmount)}</p>
        <p className="text-muted-foreground">
          확인 완료 {formatWon(memberConfirmed)} / {formatWon(finalAmount)}
          {fullySettled ? " · 완료" : ""}
        </p>
        <p className="text-muted-foreground">
          관리자 지급 {formatWon(adminPaid)} / {formatWon(finalAmount)}
        </p>
      </div>
    </div>
  )
}

function CrossCheckRow({
  label,
  adminDone,
  memberDone,
  amount,
}: {
  label: string
  adminDone: boolean
  memberDone: boolean
  amount: number
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div>
        <p className="font-medium text-foreground">{label}</p>
        <p className="text-muted-foreground">{formatWon(amount)}</p>
      </div>
      <div className="text-right text-muted-foreground">
        <p>관리자 지급 {adminDone ? "✅" : "대기"}</p>
        <p>혈원 수령 {memberDone ? "✅" : "대기"}</p>
      </div>
    </div>
  )
}

function ActionBtn({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg px-2 py-1 text-[10px] font-semibold",
        disabled
          ? "border border-border text-muted-foreground"
          : "bg-primary text-primary-foreground",
      )}
    >
      {label}
    </button>
  )
}

function CancelBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-warning/40 px-2 py-1 text-[10px] font-semibold text-warning"
    >
      {label}
    </button>
  )
}

function AdminCancelConfirmDialog({
  kind,
  onClose,
  onConfirm,
}: {
  kind: CancelKind
  onClose: () => void
  onConfirm: () => void | Promise<void>
}) {
  const copy = CANCEL_DIALOG_COPY[kind]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-sm space-y-4 p-4">
        <p className="text-sm font-semibold text-foreground">{copy.title}</p>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{copy.message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-border py-2.5 text-sm font-medium text-muted-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void onConfirm()}
            className="flex-1 rounded-xl bg-warning py-2.5 text-sm font-semibold text-warning-foreground"
          >
            {copy.confirmLabel}
          </button>
        </div>
      </Card>
    </div>
  )
}
