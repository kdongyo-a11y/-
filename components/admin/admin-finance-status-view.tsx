"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { Badge, Card, SectionTitle, StatCard } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { financeTabNav, initialDataTabNav } from "@/components/admin/admin-nav-helpers"
import { formatWon, formatWonShort } from "@/lib/guild-data"
import type { FinanceSummary } from "@/lib/finance-summary-types"
import type { FinanceTab } from "@/components/admin/admin-types"
import { fetchFinanceSummary, confirmRevenueReceipt } from "@/lib/operations-api"
import { cn } from "@/lib/utils"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

const TAB_LABELS: Record<FinanceTab, string> = {
  status: "혈맹 재정 현황",
  settlements: "정산 현황",
  dues: "혈비 관리",
  expenses: "지출 관리",
}

export function AdminFinanceStatusView({ onNavigate }: Props) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recvOpen, setRecvOpen] = useState(true)
  const [payOpen, setPayOpen] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetchFinanceSummary()
    if (res.ok && res.summary) {
      setSummary(res.summary)
    } else {
      setError(res.message ?? "재정 현황을 불러오지 못했습니다.")
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
  }

  if (error || !summary) {
    return (
      <p className="py-10 text-center text-sm text-destructive">{error ?? "데이터 없음"}</p>
    )
  }

  const availableTone = summary.availableFund < 0 ? "danger" : "primary"

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "재정 관리", onClick: () => onNavigate(financeTabNav("settlements")) },
          { label: "혈맹 재정 현황" },
        ]}
      />

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {(Object.keys(TAB_LABELS) as FinanceTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onNavigate(financeTabNav(t))}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              t === "status"
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {!summary.hasCheckpoint && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Finance 2.0 기준점이 설정되지 않았습니다.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => onNavigate(initialDataTabNav("cash_checkpoint"))}
            >
              실보유액 기준점 설정
            </button>
            후 go-forward 집계가 시작됩니다.
          </p>
        </Card>
      )}

      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <StatCard
          label="실보유액"
          value={formatWonShort(summary.cashBalance) + "원"}
          sub={formatWon(summary.cashBalance)}
          tone="primary"
        />
        <StatCard
          label="사용 가능"
          value={formatWonShort(summary.availableFund) + "원"}
          sub={formatWon(summary.availableFund)}
          tone={availableTone}
        />
        <StatCard
          label="받을 금액"
          value={formatWonShort(summary.receivables) + "원"}
          sub={`혈비 ${formatWonShort(summary.receivableBreakdown.dues)} · 수익 ${formatWonShort(summary.receivableBreakdown.revenue)} · 반환 ${formatWonShort(summary.receivableBreakdown.return)}`}
          tone="neutral"
        />
        <StatCard
          label="지급 예정"
          value={formatWonShort(summary.payables) + "원"}
          sub={`정산 ${formatWonShort(summary.payableBreakdown.participant)} · 관리비 ${formatWonShort(summary.payableBreakdown.management)} · 추가 ${formatWonShort(summary.payableBreakdown.additional)}`}
          tone="neutral"
        />
      </div>

      {summary.payablesExceedCash && (
        <Card className="mb-4 flex items-start gap-2 border-destructive/40 bg-destructive/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">
            지급 예정금이 현재 실보유액을 초과합니다.
          </p>
        </Card>
      )}

      <Card className="mb-4 p-3">
        <p className="text-[11px] text-muted-foreground">
          참고: 입금 후 예상 가용{" "}
          <span className="font-semibold text-foreground">
            {formatWon(summary.projectedAvailableFund)}원
          </span>
        </p>
        {summary.roundingRemainder > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            미전환 짜투리 {summary.roundingRemainder}원
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          [Legacy] 혈맹자금(귀속){" "}
          <span className="font-semibold text-foreground">
            {formatWon(summary.legacyGuildFund)}원
          </span>
        </p>
      </Card>

      <DrilldownSection
        title="받을 금액 상세"
        open={recvOpen}
        onToggle={() => setRecvOpen((v) => !v)}
        emptyLabel="받을 금액 없음"
        onReceiptConfirmed={load}
        groups={[
          { label: "혈비 미수", items: summary.drilldown.duesReceivable },
          { label: "수익 미입금", items: summary.drilldown.revenueReceivable, receiptEnabled: true },
          { label: "반환 받을 금액", items: summary.drilldown.returnReceivable },
        ]}
      />

      <DrilldownSection
        title="지급 예정 상세"
        open={payOpen}
        onToggle={() => setPayOpen((v) => !v)}
        emptyLabel="지급 예정 없음"
        groups={[
          { label: "혈맹원 정산", items: summary.drilldown.participantPayable },
          { label: "관리비", items: summary.drilldown.managementPayable },
          { label: "추가지급", items: summary.drilldown.additionalPayable },
        ]}
      />

      {summary.checkpoint && (
        <Card className="mt-4 p-3 text-[11px] text-muted-foreground">
          기준점: {new Date(summary.checkpoint.effectiveAt).toLocaleString("ko-KR")} ·{" "}
          {formatWon(summary.checkpoint.openingCashBalance)}원
          {summary.checkpoint.memo ? ` · ${summary.checkpoint.memo}` : ""}
        </Card>
      )}
    </div>
  )
}

function DrilldownSection({
  title,
  open,
  onToggle,
  emptyLabel,
  groups,
  onReceiptConfirmed,
}: {
  title: string
  open: boolean
  onToggle: () => void
  emptyLabel: string
  onReceiptConfirmed?: () => void
  groups: Array<{
    label: string
    receiptEnabled?: boolean
    items: Array<{
      id: string
      label: string
      subLabel?: string
      amount: number
      sourceType?: "boss" | "siege"
      sourceId?: string
    }>
  }>
}) {
  const total = groups.reduce((s, g) => s + g.items.reduce((a, i) => a + i.amount, 0), 0)

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        className="mb-2 flex w-full items-center justify-between"
      >
        <SectionTitle>{title}</SectionTitle>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {formatWonShort(total)}원
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3">
          {total === 0 && (
            <Card className="py-4 text-center text-xs text-muted-foreground">{emptyLabel}</Card>
          )}
          {groups.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.label}>
                <Badge tone="neutral" className="mb-2">
                  {g.label}
                </Badge>
                <div className="flex flex-col gap-1.5">
                  {g.items.map((item) => (
                    <Card key={item.id} className="px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium">{item.label}</p>
                          {item.subLabel && (
                            <p className="text-[10px] text-muted-foreground">{item.subLabel}</p>
                          )}
                        </div>
                        <p className="text-xs font-semibold">{formatWon(item.amount)}원</p>
                      </div>
                      {g.receiptEnabled && item.sourceType && item.sourceId && onReceiptConfirmed && (
                        <RevenueReceiptForm
                          sourceType={item.sourceType}
                          sourceId={item.sourceId}
                          maxAmount={item.amount}
                          onConfirmed={onReceiptConfirmed}
                        />
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}

function RevenueReceiptForm({
  sourceType,
  sourceId,
  maxAmount,
  onConfirmed,
}: {
  sourceType: "boss" | "siege"
  sourceId: string
  maxAmount: number
  onConfirmed: () => void
}) {
  const [amount, setAmount] = useState(String(maxAmount))
  const [memo, setMemo] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    const parsed = Number(amount.replace(/\D/g, "")) || 0
    if (parsed <= 0) {
      alert("입금 금액을 입력해주세요.")
      return
    }
    setSubmitting(true)
    const res = await confirmRevenueReceipt({
      sourceType,
      sourceId,
      amount: parsed,
      memo,
    })
    setSubmitting(false)
    alert(res.message)
    if (res.ok) onConfirmed()
  }

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
      <input
        type="text"
        inputMode="numeric"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-28 rounded border border-border bg-background px-2 py-1 text-xs"
        placeholder="입금액"
      />
      <input
        type="text"
        value={memo}
        onChange={(e) => setMemo(e.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-xs"
        placeholder="메모"
      />
      <button
        type="button"
        disabled={submitting}
        onClick={() => void submit()}
        className="rounded bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        입금 확인
      </button>
    </div>
  )
}
