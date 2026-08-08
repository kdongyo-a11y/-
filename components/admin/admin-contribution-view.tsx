"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useMembers } from "@/components/members-context"
import {
  useContributionPeriod,
  getThisMonthPeriod,
  getLastMonthPeriod,
  getAllTimePeriod,
  getYearMonthPeriod,
  type ContributionPeriod,
} from "@/components/use-contribution"
import { contributionMemberNav } from "@/components/admin/admin-nav-helpers"
import { cn } from "@/lib/utils"

type Props = {
  memberId?: string
  onNavigate: (nav: AdminNavState) => void
}

type PeriodKey = "this_month" | "last_month" | "all"

type MemberScoreSummary = {
  thisMonth: number
  allTime: number
  monthlyScores: { yearMonth: string; total: number }[]
}

export function AdminContributionView({ memberId, onNavigate }: Props) {
  const { members, getMember } = useMembers()
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_month")
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [scoreSummary, setScoreSummary] = useState<MemberScoreSummary | null>(null)

  const period: ContributionPeriod =
    selectedMonth
      ? getYearMonthPeriod(selectedMonth)
      : periodKey === "this_month"
        ? getThisMonthPeriod()
        : periodKey === "last_month"
          ? getLastMonthPeriod()
          : getAllTimePeriod()

  const { summary, getMemberContribution } = useContributionPeriod(period)
  const selected = memberId ? getMember(memberId) : undefined

  const loadScoreSummary = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/contribution/member/${id}?months=12`)
    const data = (await res.json()) as {
      ok: boolean
      thisMonth?: number
      allTime?: number
      monthlyScores?: { yearMonth: string; total: number }[]
    }
    if (data.ok) {
      setScoreSummary({
        thisMonth: data.thisMonth ?? 0,
        allTime: data.allTime ?? 0,
        monthlyScores: data.monthlyScores ?? [],
      })
    }
  }, [])

  useEffect(() => {
    if (selected) void loadScoreSummary(selected.id)
  }, [selected, loadScoreSummary])

  const rankedWithNames = useMemo(() => {
    return summary.ranked
      .map((row) => {
        const m = members.find((x) => x.id === row.memberId)
        if (!m || m.status !== "활동") return null
        return { member: m, ...row }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }, [summary.ranked, members])

  if (selected) {
    const monthDetail = getMemberContribution(selected.id)

    return (
      <div>
        <AdminBreadcrumb
          items={[
            { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
            { label: "기여도 관리", onClick: () => onNavigate({ section: "contribution" }) },
            { label: selected.nickname },
          ]}
        />
        <Card className="mb-4">
          <p className="text-lg font-semibold">{selected.nickname}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-[11px] text-muted-foreground">이번 달</p>
              <p className="font-semibold text-primary">{scoreSummary?.thisMonth ?? 0}점</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">전체 누적</p>
              <p className="font-semibold text-primary">{scoreSummary?.allTime ?? 0}점</p>
            </div>
          </div>
        </Card>

        {!selectedMonth && scoreSummary && (
          <>
            <SectionTitle>월별 기여도</SectionTitle>
            <div className="mb-4 flex flex-col gap-2">
              {scoreSummary.monthlyScores.map((m) => (
                <button
                  key={m.yearMonth}
                  type="button"
                  onClick={() => setSelectedMonth(m.yearMonth)}
                  className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent"
                >
                  <span className="text-sm font-medium">{m.yearMonth}</span>
                  <Badge tone="primary">{m.total}점</Badge>
                </button>
              ))}
            </div>
          </>
        )}

        {selectedMonth && (
          <button
            type="button"
            onClick={() => setSelectedMonth(null)}
            className="mb-3 text-xs text-primary"
          >
            ← 월별 목록으로
          </button>
        )}

        <Card className="mb-4 py-4 text-center">
          <p className="text-3xl font-bold text-primary">{monthDetail.breakdown.total}점</p>
          <p className="text-xs text-muted-foreground">
            {selectedMonth ? `${selectedMonth} 기여도` : period.label}
          </p>
        </Card>
        <SectionTitle>점수 발생 근거</SectionTitle>
        <div className="flex flex-col gap-2">
          {monthDetail.events.length === 0 && (
            <Card className="py-6 text-center text-xs text-muted-foreground">기록 없음</Card>
          )}
          {monthDetail.events.map((e) => (
            <Card key={e.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{e.sub}</p>
                <p className="text-[11px] text-muted-foreground">{e.label}</p>
              </div>
              <span className="font-semibold text-primary">+{e.points}</span>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기여도 관리" },
        ]}
      />

      <div className="mb-4 flex gap-2">
        <PeriodChip label="이번 달" active={periodKey === "this_month" && !selectedMonth} onClick={() => { setPeriodKey("this_month"); setSelectedMonth(null) }} />
        <PeriodChip label="지난 달" active={periodKey === "last_month"} onClick={() => { setPeriodKey("last_month"); setSelectedMonth(null) }} />
        <PeriodChip label="전체" active={periodKey === "all"} onClick={() => { setPeriodKey("all"); setSelectedMonth(null) }} />
      </div>

      <Card className="mb-4 space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">대상 기간</span>
          <span className="font-medium">{period.label}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">활동 혈원 수</span>
          <span>{rankedWithNames.length}명</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">총 참여기록</span>
          <span>{summary.totalRecords}건</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">평균 기여도</span>
          <span className="font-semibold text-primary">{summary.average.toFixed(1)}점</span>
        </div>
      </Card>

      <SectionTitle>혈원별 순위</SectionTitle>
      <div className="flex flex-col gap-2">
        {rankedWithNames.map((row, i) => (
          <button
            key={row.member.id}
            type="button"
            onClick={() => onNavigate(contributionMemberNav(row.member.id))}
            className="rounded-xl border border-border bg-card p-4 text-left hover:bg-accent"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex gap-2">
                <span className="w-5 text-center text-xs font-bold text-muted-foreground">{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold">{row.member.nickname}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    일반 {row.breakdown.generalCount}회 / {row.breakdown.generalPoints}점 ·{" "}
                    메인 {row.breakdown.mainCount}회 / {row.breakdown.mainPoints}점 ·{" "}
                    공성 {row.breakdown.siegeCount}회 / {row.breakdown.siegePoints}점
                  </p>
                </div>
              </div>
              <Badge tone="primary">{row.breakdown.total}점</Badge>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function PeriodChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-medium",
        active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </button>
  )
}
