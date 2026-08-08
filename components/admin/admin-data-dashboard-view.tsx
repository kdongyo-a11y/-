"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { AdminPeriodSelector } from "@/components/admin/admin-period-selector"
import type { AdminNavState } from "@/components/admin/admin-types"
import { dataManagementNav } from "@/components/admin/admin-nav-helpers"
import type { AdminDashboardData } from "@/lib/admin-data/admin-analytics"
import type { PeriodType } from "@/lib/admin-data/period-utils"
import { getTodayDateString } from "@/lib/boss-time-slots"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

type Identity = {
  guildName: string
  serverName: string
}

function formatMoney(n: number) {
  return n.toLocaleString("ko-KR")
}

export function AdminDataDashboardView({ onNavigate }: Props) {
  const [period, setPeriod] = useState<PeriodType>("this_month")
  const [dateFrom, setDateFrom] = useState(getTodayDateString().slice(0, 8) + "01")
  const [dateTo, setDateTo] = useState(getTodayDateString())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ period })
      if (period === "custom") {
        params.set("dateFrom", dateFrom)
        params.set("dateTo", dateTo)
      }
      const res = await fetch(`/api/admin/data/dashboard?${params}`)
      const json = await res.json()
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? "조회 실패")
      }
      setIdentity(json.identity)
      setDashboard(json.dashboard)
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
          { label: "운영 현황" },
        ]}
      />
      <SectionTitle>운영 현황</SectionTitle>
      {identity && (
        <p className="mb-3 text-xs text-muted-foreground">
          {identity.guildName} · {identity.serverName} 서버
        </p>
      )}

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

      {dashboard && !loading && (
        <div className="space-y-3">
          <StatCard title="혈맹원" lines={[
            `활성 ${dashboard.members.active}`,
            `휴면 ${dashboard.members.dormant}`,
            `탈퇴 ${dashboard.members.withdrawn}`,
          ]} />
          <StatCard title="보스" lines={[
            `이벤트 ${dashboard.boss.eventCount}건`,
            `총 참여 ${dashboard.boss.participationCount}회`,
            `참여 혈원 ${dashboard.boss.uniqueParticipants}명`,
          ]} />
          <StatCard title="공성" lines={[
            `이벤트 ${dashboard.siege.eventCount}건`,
            `참여 ${dashboard.siege.participationCount}회 · ${dashboard.siege.uniqueParticipants}명`,
          ]} />
          <StatCard title="정산" lines={[
            `전체 ${dashboard.settlement.total}건`,
            `완료 ${dashboard.settlement.completed}`,
            `진행 중 ${dashboard.settlement.inProgress}`,
            `미수령 ${dashboard.settlement.unsettledParticipants}건`,
          ]} />
          <StatCard title="혈비" lines={[
            `대상 ${dashboard.dues.targetMembers}명`,
            `납부 ${dashboard.dues.paidMembers} · 미납 ${dashboard.dues.unpaidMembers}`,
            `납부율 ${dashboard.dues.paymentRate}%`,
          ]} />
          <StatCard title="재정" lines={[
            `기초 혈맹자금 ${formatMoney(dashboard.finance.openingBalance)}`,
            `혈맹 귀속 수입 ${formatMoney(dashboard.finance.guildIncome)}`,
            `혈비 수입 ${formatMoney(dashboard.finance.duesIncome)}`,
            `지출 ${formatMoney(dashboard.finance.expenseTotal)}`,
            `현재 혈맹자금 ${formatMoney(dashboard.finance.currentFund)}`,
          ]} />

          <Card className="p-4">
            <p className="mb-2 text-sm font-semibold">최근 활동</p>
            {dashboard.recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground">활동 없음</p>
            ) : (
              <ul className="space-y-2">
                {dashboard.recentActivity.map((item, i) => (
                  <li key={`${item.kind}-${item.date}-${i}`} className="text-xs">
                    <span className="font-medium text-foreground">{item.date}</span>
                    <span className="mx-1 text-muted-foreground">·</span>
                    <span>{item.title}</span>
                    <span className="block text-muted-foreground">{item.sub}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}

function StatCard({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card className="p-4">
      <p className="mb-2 text-sm font-semibold">{title}</p>
      <div className="space-y-0.5">
        {lines.map((line) => (
          <p key={line} className="text-xs text-muted-foreground">{line}</p>
        ))}
      </div>
    </Card>
  )
}
