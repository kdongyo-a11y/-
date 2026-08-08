"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { AdminPeriodSelector } from "@/components/admin/admin-period-selector"
import type { AdminNavState } from "@/components/admin/admin-types"
import { dataManagementNav } from "@/components/admin/admin-nav-helpers"
import type { AdminAggregatesData } from "@/lib/admin-data/admin-analytics"
import type { PeriodType } from "@/lib/admin-data/period-utils"
import { getTodayDateString } from "@/lib/boss-time-slots"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

function formatMoney(n: number) {
  return n.toLocaleString("ko-KR")
}

export function AdminDataAggregatesView({ onNavigate }: Props) {
  const [period, setPeriod] = useState<PeriodType>("this_month")
  const [dateFrom, setDateFrom] = useState(getTodayDateString().slice(0, 8) + "01")
  const [dateTo, setDateTo] = useState(getTodayDateString())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aggregates, setAggregates] = useState<AdminAggregatesData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ period })
      if (period === "custom") {
        params.set("dateFrom", dateFrom)
        params.set("dateTo", dateTo)
      }
      const res = await fetch(`/api/admin/data/aggregates?${params}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "조회 실패")
      }
      setAggregates(json.aggregates)
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패")
    } finally {
      setLoading(false)
    }
  }, [period, dateFrom, dateTo])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "데이터 관리", onClick: () => onNavigate(dataManagementNav()) },
          { label: "기간별 집계" },
        ]}
      />
      <SectionTitle>기간별 집계</SectionTitle>

      <AdminPeriodSelector
        period={period}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onPeriodChange={setPeriod}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      {loading && <p className="text-sm text-muted-foreground">불러오는 중...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {aggregates && !loading && (
        <div className="space-y-3">
          <AggregateSection title="보스 (일별)">
            {aggregates.bossByDate.length === 0 ? (
              <EmptyLine />
            ) : (
              aggregates.bossByDate.map((row) => (
                <Line key={row.date} text={`${row.date} · 이벤트 ${row.events} · 참여 ${row.participations} · ${row.participants}명`} />
              ))
            )}
          </AggregateSection>

          <AggregateSection title="공성 (이벤트별)">
            {aggregates.siegeByEvent.length === 0 ? (
              <EmptyLine />
            ) : (
              aggregates.siegeByEvent.map((row) => (
                <Line key={row.date + row.title} text={`${row.title} · ${row.participants}명`} />
              ))
            )}
          </AggregateSection>

          <AggregateSection title="정산">
            {aggregates.settlementSummary.length === 0 ? (
              <EmptyLine />
            ) : (
              aggregates.settlementSummary.map((row) => (
                <Line
                  key={row.title}
                  text={`${row.title} · 수익 ${formatMoney(row.totalRevenue)} · 혈맹 ${formatMoney(row.guildShare)} · 분배 ${formatMoney(row.distributable)} · ${row.status}`}
                />
              ))
            )}
          </AggregateSection>

          <AggregateSection title="혈비 (월별)">
            {aggregates.duesByMonth.length === 0 ? (
              <EmptyLine />
            ) : (
              aggregates.duesByMonth.map((row) => (
                <Line key={row.month} text={`${row.month} · 부과 ${row.target} · 납부 ${row.paid} · 미납 ${row.unpaid}`} />
              ))
            )}
          </AggregateSection>

          <AggregateSection title="지출 (월별)">
            {aggregates.expensesByMonth.length === 0 ? (
              <EmptyLine />
            ) : (
              aggregates.expensesByMonth.map((row) => (
                <Line key={row.month} text={`${row.month} · ${formatMoney(row.total)}`} />
              ))
            )}
          </AggregateSection>

          <AggregateSection title="장부">
            <Line text={`수입 ${formatMoney(aggregates.ledgerSummary.income)} · 지출 ${formatMoney(aggregates.ledgerSummary.expense)} · 순변동 ${formatMoney(aggregates.ledgerSummary.netChange)}`} />
          </AggregateSection>

          <AggregateSection title="기여도">
            {aggregates.contributionRanked.length === 0 ? (
              <EmptyLine />
            ) : (
              aggregates.contributionRanked.slice(0, 20).map((row) => (
                <Line
                  key={row.nickname}
                  text={`${row.nickname} · 일반 ${row.generalCount}/${row.generalPoints} · 메인 ${row.mainCount}/${row.mainPoints} · 공성 ${row.siegeCount}/${row.siegePoints} · 총 ${row.total}`}
                />
              ))
            )}
          </AggregateSection>
        </div>
      )}
    </div>
  )
}

function AggregateSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="space-y-1">{children}</div>
    </Card>
  )
}

function Line({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>
}

function EmptyLine() {
  return <p className="text-xs text-muted-foreground">데이터 없음</p>
}
