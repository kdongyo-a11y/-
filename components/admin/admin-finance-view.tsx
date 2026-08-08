"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Plus } from "lucide-react"
import { Badge, Card, SectionTitle, StatCard } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState, FinanceTab } from "@/components/admin/admin-types"
import { useSettlement, isSettlementComplete } from "@/components/settlement-context"
import { useGuildLedger } from "@/components/guild-ledger-context"
import { useDues } from "@/components/dues-context"
import { useMembers } from "@/components/members-context"
import { EXPENSE_TYPES, type ExpenseType } from "@/lib/expense-types"
import { formatWon, formatWonShort } from "@/lib/guild-data"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { financeTabNav, bossSlotNav, siegeDetailNav, duesBillNav } from "@/components/admin/admin-nav-helpers"
import { cn } from "@/lib/utils"
import { Coins } from "lucide-react"

type Props = {
  tab: FinanceTab
  onNavigate: (nav: AdminNavState) => void
}

const TAB_LABELS: Record<FinanceTab, string> = {
  settlements: "정산 현황",
  dues: "혈비 관리",
  expenses: "지출 관리",
}

export function AdminFinanceView({ tab, onNavigate }: Props) {
  const { settlements, getSettlementSummary } = useSettlement()
  const { guildFund, expenses, addExpense, updateExpense, cancelExpense, getMonthExpenseCount, getMonthExpenseTotal } =
    useGuildLedger()
  const { bills, createBill, getBillSummary, getUnpaidCount } = useDues()
  const { getStats } = useMembers()
  const today = getTodayDateString()
  const yearMonth = today.slice(0, 7)

  const [showCreateBill, setShowCreateBill] = useState(false)
  const [billMonth, setBillMonth] = useState(yearMonth)
  const [billAmount, setBillAmount] = useState("500000")
  const [billDue, setBillDue] = useState(`${yearMonth}-15`)
  const [billMemo, setBillMemo] = useState("")

  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [expenseForm, setExpenseForm] = useState({
    expenseDate: today,
    expenseType: "기타 운영비" as ExpenseType,
    amount: "",
    target: "",
    description: "",
    memo: "",
  })
  const [editExpenseId, setEditExpenseId] = useState<string | null>(null)

  const incomplete = useMemo(() => {
    return Object.values(settlements)
      .map((s) => {
        const summary = getSettlementSummary(s.sourceType, s.sourceId)
        if (!summary) return null
        const allDone = s.participants.every((p) =>
          isSettlementComplete(p.adminPaid, p.memberReceived),
        )
        if (allDone) return null
        return { settlement: s, summary }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.settlement.createdAt - a.settlement.createdAt)
  }, [settlements, getSettlementSummary])

  const monthExpenses = useMemo(
    () => expenses.filter((e) => !e.cancelled && e.expenseDate.startsWith(yearMonth)),
    [expenses, yearMonth],
  )

  function openSettlement(sourceType: "boss" | "siege", sourceId: string) {
    if (sourceType === "boss") {
      onNavigate(bossSlotNav(sourceId.slice(0, 10), sourceId))
    } else {
      onNavigate(siegeDetailNav(sourceId))
    }
  }

  async function handleCreateBill() {
    const amount = parseInt(billAmount.replace(/\D/g, ""), 10) || 0
    const r = await createBill({
      yearMonth: billMonth,
      amountPerMember: amount,
      dueDate: billDue,
      memo: billMemo,
    })
    alert(r.message)
    if (r.ok) {
      setShowCreateBill(false)
      if (r.bill) onNavigate(duesBillNav(r.bill.id))
    }
  }

  async function submitExpense() {
    const amount = parseInt(expenseForm.amount.replace(/\D/g, ""), 10) || 0
    if (editExpenseId) {
      const r = await updateExpense(
        editExpenseId,
        {
          expenseDate: expenseForm.expenseDate,
          expenseType: expenseForm.expenseType,
          amount,
          target: expenseForm.target,
          description: expenseForm.description,
          memo: expenseForm.memo,
        },
        expenseForm.memo || "지출 수정",
      )
      alert(r.message)
    } else {
      const r = await addExpense({
        expenseDate: expenseForm.expenseDate,
        expenseType: expenseForm.expenseType,
        amount,
        target: expenseForm.target,
        description: expenseForm.description,
        memo: expenseForm.memo,
      })
      alert(r.message)
    }
    setShowExpenseForm(false)
    setEditExpenseId(null)
    setExpenseForm({
      expenseDate: today,
      expenseType: "기타 운영비",
      amount: "",
      target: "",
      description: "",
      memo: "",
    })
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "재정 관리" },
          { label: TAB_LABELS[tab] },
        ]}
      />

      <StatCard
        label="혈맹 현재자금"
        value={formatWonShort(guildFund) + "원"}
        sub={formatWon(guildFund)}
        tone="primary"
        icon={<Coins className="h-3.5 w-3.5" />}
      />

      <div className="mb-4 mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {(Object.keys(TAB_LABELS) as FinanceTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onNavigate(financeTabNav(t))}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium",
              tab === t ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {tab === "settlements" && (
        <>
          <SectionTitle action={<Badge tone="warning">{incomplete.length}건</Badge>}>미완료 정산</SectionTitle>
          <div className="flex flex-col gap-2">
            {incomplete.length === 0 && (
              <Card className="py-6 text-center text-xs text-muted-foreground">미완료 정산이 없습니다.</Card>
            )}
            {incomplete.map(({ settlement: s, summary }) => (
              <button
                key={`${s.sourceType}:${s.sourceId}`}
                type="button"
                onClick={() => openSettlement(s.sourceType, s.sourceId)}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent"
              >
                <div>
                  <p className="text-sm font-medium">{s.displayTitle}</p>
                  <p className="text-[11px] text-muted-foreground">{s.displaySub}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-primary">수령확인 {summary.memberReceived} / {summary.total}</p>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {tab === "dues" && (
        <>
          <button
            type="button"
            onClick={() => setShowCreateBill((v) => !v)}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" />
            혈비 부과
          </button>

          {showCreateBill && (
            <Card className="mb-4 flex flex-col gap-3">
              <label className="text-xs text-muted-foreground">
                대상 월
                <input type="month" value={billMonth} onChange={(e) => setBillMonth(e.target.value)} className="mt-1 w-full rounded-xl border bg-input px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-muted-foreground">
                1인 혈비
                <input value={billAmount} onChange={(e) => setBillAmount(e.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-xl border bg-input px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-muted-foreground">
                납부기한
                <input type="date" value={billDue} onChange={(e) => setBillDue(e.target.value)} className="mt-1 w-full rounded-xl border bg-input px-3 py-2 text-sm" />
              </label>
              <textarea value={billMemo} onChange={(e) => setBillMemo(e.target.value)} placeholder="메모" rows={2} className="w-full rounded-xl border bg-input px-3 py-2 text-sm" />
              <button type="button" onClick={handleCreateBill} className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                부과하기 (활동 {getStats().active}명 스냅샷)
              </button>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {bills.map((bill) => {
              const summary = getBillSummary(bill.id)
              if (!summary) return null
              return (
                <button
                  key={bill.id}
                  type="button"
                  onClick={() => onNavigate(duesBillNav(bill.id))}
                  className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent"
                >
                  <p className="font-semibold">{bill.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatWon(bill.amountPerMember)} · 대상 {summary.totalTargets}명 · 납부기한 {bill.dueDate}
                  </p>
                  <p className="mt-1 text-xs">
                    납부완료 {summary.paid} · 미납 {summary.unpaid}
                  </p>
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            현재 월 미납 {getUnpaidCount()}명
          </p>
        </>
      )}

      {tab === "expenses" && (
        <>
          <Card className="mb-3 grid grid-cols-2 gap-2 py-3 text-center text-xs">
            <div>
              <p className="text-sm font-semibold text-destructive">{formatWon(getMonthExpenseTotal(yearMonth))}</p>
              <p className="text-[10px] text-muted-foreground">이번 달 총 지출</p>
            </div>
            <div>
              <p className="text-sm font-semibold">{getMonthExpenseCount(yearMonth)}건</p>
              <p className="text-[10px] text-muted-foreground">지출 건수</p>
            </div>
          </Card>

          <button
            type="button"
            onClick={() => {
              setEditExpenseId(null)
              setShowExpenseForm(true)
            }}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
          >
            <Plus className="h-4 w-4" />
            지출 등록
          </button>

          {showExpenseForm && (
            <Card className="mb-4 flex flex-col gap-3">
              <input type="date" value={expenseForm.expenseDate} onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })} className="rounded-xl border bg-input px-3 py-2 text-sm" />
              <select value={expenseForm.expenseType} onChange={(e) => setExpenseForm({ ...expenseForm, expenseType: e.target.value as ExpenseType })} className="rounded-xl border bg-input px-3 py-2 text-sm">
                {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value.replace(/\D/g, "") })} placeholder="금액 *" className="rounded-xl border bg-input px-3 py-2 text-sm" />
              <input value={expenseForm.target} onChange={(e) => setExpenseForm({ ...expenseForm, target: e.target.value })} placeholder="대상" className="rounded-xl border bg-input px-3 py-2 text-sm" />
              <input value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="내용 *" className="rounded-xl border bg-input px-3 py-2 text-sm" />
              <input value={expenseForm.memo} onChange={(e) => setExpenseForm({ ...expenseForm, memo: e.target.value })} placeholder="메모" className="rounded-xl border bg-input px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowExpenseForm(false)} className="flex-1 rounded-xl border py-2.5 text-sm">취소</button>
                <button type="button" onClick={submitExpense} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground">{editExpenseId ? "수정" : "등록"}</button>
              </div>
            </Card>
          )}

          <div className="flex flex-col gap-2">
            {monthExpenses.length === 0 && (
              <Card className="py-6 text-center text-xs text-muted-foreground">이번 달 지출이 없습니다.</Card>
            )}
            {monthExpenses.map((e) => (
              <Card key={e.id} className={cn("py-3", e.cancelled && "opacity-50")}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">{e.expenseType} · {e.expenseDate}</p>
                    {e.target && <p className="text-[11px] text-muted-foreground">대상: {e.target}</p>}
                  </div>
                  <p className="font-semibold text-destructive">-{formatWon(e.amount)}</p>
                </div>
                {!e.cancelled && (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditExpenseId(e.id)
                        setExpenseForm({
                          expenseDate: e.expenseDate,
                          expenseType: e.expenseType,
                          amount: String(e.amount),
                          target: e.target,
                          description: e.description,
                          memo: e.memo,
                        })
                        setShowExpenseForm(true)
                      }}
                      className="rounded-lg border px-2 py-1 text-[10px]"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const memo = window.prompt("취소 메모를 입력하세요.") ?? ""
                        if (!memo.trim()) return
                        const r = cancelExpense(e.id, memo.trim())
                        alert(r.message)
                      }}
                      className="rounded-lg border border-destructive/40 px-2 py-1 text-[10px] text-destructive"
                    >
                      지출 취소
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
