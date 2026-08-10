"use client"

import { CheckCircle2, Circle } from "lucide-react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { formatWon } from "@/lib/guild-data"
import {
  MANAGEMENT_PAYMENT_STATUS_LABELS,
  type SettlementManagementPayment,
} from "@/lib/settlement-management-payment-types"
import type { Settlement, SettlementSourceType } from "@/lib/settlement-types"
import { cn } from "@/lib/utils"

type SettlementManagementFeeSectionProps = {
  settlement: Settlement
  sourceType: SettlementSourceType
  sourceId: string
  canMarkAdminPaid?: boolean
  onConfirmAdminPayment?: (memberId: string) => void | Promise<void>
  onCancelAdminPayment?: (memberId: string) => void | Promise<void>
}

export function SettlementManagementFeeSection({
  settlement,
  canMarkAdminPaid = false,
  onConfirmAdminPayment,
  onCancelAdminPayment,
}: SettlementManagementFeeSectionProps) {
  const payments = settlement.managementPayments ?? []
  const total = settlement.managementFeeTotal ?? 0

  if (total <= 0 && payments.length === 0) return null

  return (
    <div className="flex flex-col gap-2">
      <SectionTitle>관리비 지급</SectionTitle>

      {payments.length === 0 ? (
        <Card className="py-3 text-center text-xs text-muted-foreground">
          관리비 {formatWon(total)} · 지급 추적 데이터 없음 (레거시 정산)
        </Card>
      ) : (
        <>
          {payments.map((payment) => (
            <ManagementPaymentRow
              key={payment.memberId}
              payment={payment}
              canMarkAdminPaid={canMarkAdminPaid}
              onConfirmAdminPayment={onConfirmAdminPayment}
              onCancelAdminPayment={onCancelAdminPayment}
            />
          ))}
          <Card className="flex items-center justify-between py-2.5 px-3">
            <span className="text-xs text-muted-foreground">총 관리비</span>
            <span className="font-mono text-sm font-semibold tabular-nums">{formatWon(total)}</span>
          </Card>
        </>
      )}
    </div>
  )
}

function ManagementPaymentRow({
  payment,
  canMarkAdminPaid,
  onConfirmAdminPayment,
  onCancelAdminPayment,
}: {
  payment: SettlementManagementPayment
  canMarkAdminPaid: boolean
  onConfirmAdminPayment?: (memberId: string) => void | Promise<void>
  onCancelAdminPayment?: (memberId: string) => void | Promise<void>
}) {
  const complete = payment.status === "confirmed"

  return (
    <Card className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{payment.snapshotNickname}</p>
          {complete ? (
            <Badge tone="success">완료</Badge>
          ) : (
            <Badge tone="neutral">{MANAGEMENT_PAYMENT_STATUS_LABELS[payment.status]}</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatWon(payment.amount)}
          {payment.ratioBp > 0 && (
            <span className="ml-1 text-muted-foreground/80">
              ({(payment.ratioBp / 100).toFixed(1)}%)
            </span>
          )}
        </p>
        <div className="mt-1 flex gap-2 text-[10px]">
          <StatusChip done={payment.adminPaid} label="지급" />
          <StatusChip done={payment.memberConfirmed} label="수령" />
        </div>
        {payment.memo && (
          <p className="mt-1 text-[10px] text-muted-foreground">메모: {payment.memo}</p>
        )}
      </div>

      {canMarkAdminPaid && (
        <div className="flex shrink-0 flex-col gap-1">
          {!payment.adminPaid ? (
            <button
              type="button"
              onClick={() => onConfirmAdminPayment?.(payment.memberId)}
              className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
            >
              지급완료
            </button>
          ) : (
            <>
              <span className="rounded-lg border border-success/30 px-2 py-1 text-center text-[10px] font-medium text-success">
                ✓ 지급 완료
              </span>
              {!payment.memberConfirmed && (
                <button
                  type="button"
                  onClick={() => onCancelAdminPayment?.(payment.memberId)}
                  className="rounded-lg border border-warning/40 px-2 py-1 text-[10px] font-semibold text-warning"
                >
                  지급 완료 취소
                </button>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function StatusChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", done ? "text-success" : "text-muted-foreground")}>
      {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {label}
    </span>
  )
}
