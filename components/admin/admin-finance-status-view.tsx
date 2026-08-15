"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { Badge, Card, SectionTitle, StatCard } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { financeTabNav, initialDataTabNav } from "@/components/admin/admin-nav-helpers"
import { formatWon, formatWonShort } from "@/lib/guild-data"
import type {
  FinanceSummary,
  FinanceWorkItem,
  FinanceWorkItemKind,
  FinanceWorkQueueSort,
  SettlementRevenueDetail,
} from "@/lib/finance-summary-types"
import type { FinanceTab } from "@/components/admin/admin-types"
import {
  confirmRevenueReceipt,
  fetchFinanceSummary,
} from "@/lib/operations-api"
import {
  getWorkQueueNavigateAction,
  isInlineWorkQueueMutationEnabled,
} from "@/lib/finance-work-queue-actions"
import { trackInteraction } from "@/lib/interaction-perf"
import {
  FINANCE_WORK_ITEM_KIND_LABELS,
  sortFinanceWorkItems,
} from "@/lib/finance-work-item-utils"
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

const SORT_OPTIONS: Array<{ value: FinanceWorkQueueSort; label: string }> = [
  { value: "remaining_desc", label: "미처리 금액 큰 순" },
  { value: "newest", label: "최신순" },
  { value: "oldest", label: "오래된 순" },
  { value: "kind", label: "유형" },
]

const RECEIVABLE_KINDS: FinanceWorkItemKind[] = [
  "revenue_receivable",
  "dues_receivable",
  "return_receivable",
]

const PAYABLE_KINDS: FinanceWorkItemKind[] = [
  "participant_payable",
  "management_payable",
  "additional_payable",
]

export function AdminFinanceStatusView({ onNavigate }: Props) {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recvSort, setRecvSort] = useState<FinanceWorkQueueSort>("remaining_desc")
  const [paySort, setPaySort] = useState<FinanceWorkQueueSort>("remaining_desc")
  const [recvKindFilter, setRecvKindFilter] = useState<FinanceWorkItemKind | "all">("all")
  const [payKindFilter, setPayKindFilter] = useState<FinanceWorkItemKind | "all">("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

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

  const receivableQueue = useMemo(() => {
    if (!summary) return []
    let items = summary.receivableQueue
    if (recvKindFilter !== "all") {
      items = items.filter((i) => i.kind === recvKindFilter)
    }
    return sortFinanceWorkItems(items, recvSort)
  }, [summary, recvSort, recvKindFilter])

  const payableQueue = useMemo(() => {
    if (!summary) return []
    let items = summary.payableQueue
    if (payKindFilter !== "all") {
      items = items.filter((i) => i.kind === payKindFilter)
    }
    return sortFinanceWorkItems(items, paySort)
  }, [summary, paySort, payKindFilter])

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

      <WorkQueueSection
        title="받을 금액 업무"
        emptyLabel="받을 금액 없음"
        queue={receivableQueue}
        totalRemaining={summary.receivables}
        sort={recvSort}
        kindFilter={recvKindFilter}
        kindOptions={RECEIVABLE_KINDS}
        onSortChange={setRecvSort}
        onKindFilterChange={setRecvKindFilter}
        expandedId={expandedId}
        onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        revenueDetails={summary.revenueDetails}
        onActionComplete={load}
        onNavigate={onNavigate}
      />

      <WorkQueueSection
        title="지급 예정 업무"
        emptyLabel="지급 예정 없음"
        queue={payableQueue}
        totalRemaining={summary.payables}
        sort={paySort}
        kindFilter={payKindFilter}
        kindOptions={PAYABLE_KINDS}
        onSortChange={setPaySort}
        onKindFilterChange={setPayKindFilter}
        expandedId={expandedId}
        onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
        revenueDetails={summary.revenueDetails}
        onActionComplete={load}
        onNavigate={onNavigate}
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

function WorkQueueSection({
  title,
  emptyLabel,
  queue,
  totalRemaining,
  sort,
  kindFilter,
  kindOptions,
  onSortChange,
  onKindFilterChange,
  expandedId,
  onToggleExpand,
  revenueDetails,
  onActionComplete,
  onNavigate,
}: {
  title: string
  emptyLabel: string
  queue: FinanceWorkItem[]
  totalRemaining: number
  sort: FinanceWorkQueueSort
  kindFilter: FinanceWorkItemKind | "all"
  kindOptions: FinanceWorkItemKind[]
  onSortChange: (s: FinanceWorkQueueSort) => void
  onKindFilterChange: (k: FinanceWorkItemKind | "all") => void
  expandedId: string | null
  onToggleExpand: (id: string) => void
  revenueDetails: Record<string, SettlementRevenueDetail>
  onActionComplete: () => void
  onNavigate: (nav: AdminNavState) => void
}) {
  const [open, setOpen] = useState(true)
  const queueSum = queue.reduce((s, i) => s + i.remainingAmount, 0)

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex w-full items-center justify-between"
      >
        <SectionTitle>{title}</SectionTitle>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {formatWonShort(queueSum)}원
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <>
          <div className="mb-2 flex flex-wrap gap-2">
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as FinanceWorkQueueSort)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-[10px]"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={kindFilter}
              onChange={(e) =>
                onKindFilterChange(e.target.value as FinanceWorkItemKind | "all")
              }
              className="rounded-lg border border-border bg-background px-2 py-1 text-[10px]"
            >
              <option value="all">전체 유형</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {FINANCE_WORK_ITEM_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {queue.length === 0 ? (
            <Card className="py-4 text-center text-xs text-muted-foreground">{emptyLabel}</Card>
          ) : (
            <div className="flex flex-col gap-1.5">
              {queue.map((item) => (
                <WorkItemCard
                  key={item.id}
                  item={item}
                  expanded={expandedId === item.id}
                  onToggle={() => onToggleExpand(item.id)}
                  revenueDetail={
                    item.settlementDbId ? revenueDetails[item.settlementDbId] : undefined
                  }
                  onActionComplete={onActionComplete}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}

          {kindFilter === "all" && queueSum !== totalRemaining && queue.length > 0 && (
            <p className="mt-2 text-[10px] text-destructive">
              집계 불일치: 큐 합계 {formatWon(queueSum)} ≠ 전체 {formatWon(totalRemaining)}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function WorkItemCard({
  item,
  expanded,
  onToggle,
  revenueDetail,
  onActionComplete,
  onNavigate,
}: {
  item: FinanceWorkItem
  expanded: boolean
  onToggle: () => void
  revenueDetail?: SettlementRevenueDetail
  onActionComplete: () => void
  onNavigate: (nav: AdminNavState) => void
}) {
  const navigateAction = getWorkQueueNavigateAction(item)

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="neutral" className="text-[9px]">
              {FINANCE_WORK_ITEM_KIND_LABELS[item.kind]}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{item.statusLabel}</span>
          </div>
          <p className="truncate text-xs font-medium">{item.title}</p>
          <p className="truncate text-[10px] text-muted-foreground">{item.subtitle}</p>
        </div>
        <div className="ml-2 shrink-0 text-right">
          <p className="text-xs font-semibold">{formatWon(item.remainingAmount)}원</p>
          <p className="text-[9px] text-muted-foreground">
            / {formatWonShort(item.totalAmount)}
          </p>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          <p className="mb-2 text-[10px] text-muted-foreground">{item.description}</p>

          {isInlineWorkQueueMutationEnabled(item.kind) &&
            item.kind === "revenue_receivable" &&
            revenueDetail && (
              <RevenueDetailPanel detail={revenueDetail} onReceiptConfirmed={onActionComplete} />
            )}

          {!isInlineWorkQueueMutationEnabled(item.kind) && navigateAction && (
            <WorkQueueNavigateButton action={navigateAction} onNavigate={onNavigate} />
          )}

          {!isInlineWorkQueueMutationEnabled(item.kind) && !navigateAction && (
            <p className="text-[10px] text-muted-foreground">
              해당 업무는 기존 화면에서 처리해주세요.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function WorkQueueNavigateButton({
  action,
  onNavigate,
}: {
  action: { label: string; nav: AdminNavState }
  onNavigate: (nav: AdminNavState) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground">
        Finance 2.0-B 이전에는 이 화면에서 직접 처리하지 않습니다. 기존 업무 화면에서
        완료해주세요.
      </p>
      <button
        type="button"
        onClick={() => onNavigate(action.nav)}
        className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
      >
        {action.label}
      </button>
    </div>
  )
}

function RevenueDetailPanel({
  detail,
  onReceiptConfirmed,
}: {
  detail: SettlementRevenueDetail
  onReceiptConfirmed: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="총 수익" value={detail.totalIncome} />
        <MiniStat label="입금 완료" value={detail.receivedAmount} />
        <MiniStat label="미입금" value={detail.receivableAmount} tone="primary" />
      </div>

      <div>
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">수익 발생 내용</p>
        {detail.items.length === 0 ? (
          <Card className="py-3 text-center text-[10px] text-muted-foreground">
            수익 상세 기록 없음
          </Card>
        ) : (
          <div className="flex flex-col gap-1">
            {detail.items.map((row) => (
              <Card key={row.id} className="px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium">{row.description}</p>
                    {(row.quantity != null || row.unitPrice != null) && (
                      <p className="text-[10px] text-muted-foreground">
                        {row.quantity != null ? `수량 ${row.quantity}` : ""}
                        {row.quantity != null && row.unitPrice != null ? " · " : ""}
                        {row.unitPrice != null ? `단가 ${formatWon(row.unitPrice)}` : ""}
                      </p>
                    )}
                    {row.memo && (
                      <p className="text-[10px] text-muted-foreground">{row.memo}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-xs font-semibold">{formatWon(row.amount)}원</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">입금 이력</p>
        {detail.receipts.length === 0 ? (
          <Card className="py-3 text-center text-[10px] text-muted-foreground">
            입금 이력 없음
          </Card>
        ) : (
          <div className="flex flex-col gap-1">
            {detail.receipts.map((r) => (
              <Card key={r.id} className="flex items-center justify-between px-2.5 py-2">
                <div>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.receivedAt).toLocaleString("ko-KR")}
                  </p>
                  {r.memo && <p className="text-[10px]">{r.memo}</p>}
                </div>
                <p className="text-xs font-semibold">{formatWon(r.amount)}원</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {detail.receivableAmount > 0 && (
        <RevenueReceiptForm
          sourceType={detail.sourceType}
          sourceId={detail.sourceId}
          maxAmount={detail.receivableAmount}
          onConfirmed={onReceiptConfirmed}
        />
      )}
    </div>
  )
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string
  value: number
  tone?: "neutral" | "primary"
}) {
  return (
    <Card className="px-2 py-1.5">
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-xs font-semibold tabular-nums",
          tone === "primary" ? "text-primary" : "text-foreground",
        )}
      >
        {formatWon(value)}원
      </p>
    </Card>
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
    const tracker = trackInteraction("revenue-receipt")
    tracker.markPending()
    const res = await confirmRevenueReceipt({
      sourceType,
      sourceId,
      amount: parsed,
      memo,
    })
    setSubmitting(false)
    tracker.finish({ ok: res.ok })
    alert(res.message)
    if (res.ok) onConfirmed()
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
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
