"use client"

import { useState } from "react"
import { SectionTitle, StatCard, Card } from "@/components/ui-bits"
import { useGuildLedger, type LedgerEntry } from "@/components/guild-ledger-context"
import { formatWon } from "@/lib/guild-data"
import { getTodayDateString } from "@/lib/boss-time-slots"
import { ArrowDownLeft, ArrowUpRight, Coins } from "lucide-react"
import { cn } from "@/lib/utils"

const filters = ["전체", "수입", "지출"] as const

export function LedgerScreen() {
  const {
    guildFund,
    openingBalance,
    cumulativeGuildContributions,
    getActiveEntries,
    getMonthGuildIncome,
    getMonthGuildExpense,
  } = useGuildLedger()
  const [filter, setFilter] = useState<(typeof filters)[number]>("전체")
  const yearMonth = getTodayDateString().slice(0, 7)

  const entries = getActiveEntries()
  const income = getMonthGuildIncome(yearMonth)
  const expense = getMonthGuildExpense(yearMonth)
  const list = entries.filter((e) => filter === "전체" || e.type === filter)

  return (
    <div>
      <SectionTitle>혈맹 장부</SectionTitle>

      <div className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/15 to-card p-4">
        <div className="flex items-center gap-2 text-primary">
          <Coins className="h-4 w-4" />
          <p className="text-xs font-medium">현재 혈맹 자금</p>
        </div>
        <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
          {formatWon(guildFund)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          기준잔액 {formatWon(openingBalance)} + 공용 수입 − 공용 지출
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          누적 혈비(귀속+납부) {formatWon(cumulativeGuildContributions)}
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard
          label="이번 달 수입"
          value={"+" + Math.round(income / 10000) + "만"}
          sub={formatWon(income) + " · 귀속+혈비"}
          tone="success"
          icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
        />
        <StatCard
          label="이번 달 지출"
          value={"-" + Math.round(expense / 10000) + "만"}
          sub={formatWon(expense) + " · 공용지출"}
          tone="danger"
          icon={<ArrowUpRight className="h-3.5 w-3.5" />}
        />
      </div>

      <div className="mb-3 mt-5 flex gap-2">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {list.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">
            장부 내역이 없습니다. 정산·혈비·지출 발생 시 자동 기록됩니다.
          </Card>
        )}
        {list.map((e) => (
          <LedgerRow key={e.id} entry={e} />
        ))}
      </div>
    </div>
  )
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const isIncome = entry.type === "수입"
  return (
    <Card className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          isIncome ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
        )}
      >
        {isIncome ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{entry.category}</p>
        <p className="truncate text-xs text-muted-foreground">
          {entry.memo} · {entry.date.slice(5).replace("-", "/")}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 font-mono text-sm font-semibold tabular-nums",
          isIncome ? "text-success" : "text-destructive",
        )}
      >
        {isIncome ? "+" : "-"}
        {entry.amount.toLocaleString("ko-KR")}
      </span>
    </Card>
  )
}
