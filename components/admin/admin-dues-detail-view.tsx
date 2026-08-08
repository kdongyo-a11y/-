"use client"

import { useState } from "react"
import { Badge, Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useDues } from "@/components/dues-context"
import { DUES_PAYMENT_STATUS_LABELS, type DuesPaymentStatus } from "@/lib/dues-types"
import { financeTabNav } from "@/components/admin/admin-nav-helpers"
import { formatWon } from "@/lib/guild-data"
import { cn } from "@/lib/utils"

type Props = {
  billId: string
  onNavigate: (nav: AdminNavState) => void
}

export function AdminDuesDetailView({ billId, onNavigate }: Props) {
  const { getBill, getBillSummary, setPaymentStatus } = useDues()
  const bill = getBill(billId)
  const summary = getBillSummary(billId)

  const [memoModal, setMemoModal] = useState<{
    memberId: string
    nickname: string
    nextStatus: DuesPaymentStatus
  } | null>(null)
  const [memo, setMemo] = useState("")

  if (!bill || !summary) {
    return (
      <Card className="py-6 text-center text-sm text-muted-foreground">
        혈비를 찾을 수 없습니다.
      </Card>
    )
  }

  const items = bill.targetMemberIds.map((id) => bill.items[id]).filter(Boolean)

  async function submitStatus() {
    if (!memoModal || !memo.trim()) return
    const r = await setPaymentStatus(billId, memoModal.memberId, memoModal.nextStatus, memo.trim())
    alert(r.message)
    setMemoModal(null)
    setMemo("")
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "재정 관리", onClick: () => onNavigate(financeTabNav("dues")) },
          { label: "혈비 관리", onClick: () => onNavigate(financeTabNav("dues")) },
          { label: bill.title },
        ]}
      />

      <Card className="mb-4">
        <p className="text-lg font-semibold">{bill.title}</p>
        <p className="text-sm text-muted-foreground">
          1인 {formatWon(bill.amountPerMember)} · 납부기한 {bill.dueDate}
        </p>
        {bill.memo && <p className="mt-1 text-xs text-muted-foreground">{bill.memo}</p>}
      </Card>

      <Card className="mb-4 grid grid-cols-2 gap-2 py-3 text-center text-xs">
        <MiniStat label="총 대상" value={`${summary.totalTargets}명`} />
        <MiniStat label="납부완료" value={`${summary.paid}명`} tone="success" />
        <MiniStat label="미납" value={`${summary.unpaid}명`} tone="danger" />
        <MiniStat label="납부율" value={`${summary.rate}%`} />
        <MiniStat label="총 부과금액" value={formatWon(summary.totalAssessed)} className="col-span-2" />
        <MiniStat label="총 납부금액" value={formatWon(summary.totalCollected)} tone="primary" className="col-span-2" />
      </Card>

      <SectionTitle>혈원별 상태</SectionTitle>
      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <Card key={item.memberId} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium">{item.nickname}</p>
              <p className="text-xs text-muted-foreground">{formatWon(bill.amountPerMember)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  item.status === "PAID"
                    ? "success"
                    : item.status === "PAYMENT_REPORTED"
                      ? "warning"
                      : "danger"
                }
              >
                {DUES_PAYMENT_STATUS_LABELS[item.status]}
              </Badge>
              {item.status !== "PAID" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMemoModal({
                      memberId: item.memberId,
                      nickname: item.nickname,
                      nextStatus: "PAID",
                    })
                    setMemo("")
                  }}
                  className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
                >
                  납부완료
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMemoModal({
                      memberId: item.memberId,
                      nickname: item.nickname,
                      nextStatus: "UNPAID",
                    })
                    setMemo("")
                  }}
                  className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground"
                >
                  미납 변경
                </button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {memoModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold">
              {memoModal.nickname} ·{" "}
              {memoModal.nextStatus === "PAID" ? "납부완료 처리" : "미납으로 변경"}
            </p>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="변경 메모..."
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm"
            />
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setMemoModal(null)} className="flex-1 rounded-xl border py-2.5 text-sm">
                취소
              </button>
              <button
                type="button"
                disabled={!memo.trim()}
                onClick={submitStatus}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone,
  className,
}: {
  label: string
  value: string
  tone?: "success" | "danger" | "primary"
  className?: string
}) {
  const color =
    tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-foreground"
  return (
    <div className={className}>
      <p className={cn("text-sm font-semibold", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
