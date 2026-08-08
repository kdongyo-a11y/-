"use client"

import { useCallback, useEffect, useState } from "react"
import type {
  FeatureUsageStat,
  GuildUsageRow,
  PlatformDashboardData,
  PlatformPeriod,
  RecentGuildRow,
} from "@/lib/platform/platform-analytics"

const PERIOD_OPTIONS: { value: PlatformPeriod; label: string }[] = [
  { value: "today", label: "오늘" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "all", label: "전체" },
]

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function statusLabel(status: GuildUsageRow["status"]) {
  if (status === "active") return "활성"
  if (status === "low_activity") return "저활성"
  return "미사용"
}

function statusClass(status: GuildUsageRow["status"]) {
  if (status === "active") return "text-emerald-400"
  if (status === "low_activity") return "text-amber-400"
  return "text-muted-foreground"
}

function KpiCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

type Props = {
  displayName: string
}

export function PlatformDashboardView({ displayName }: Props) {
  const [period, setPeriod] = useState<PlatformPeriod>("7d")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<PlatformDashboardData | null>(null)
  const [guildRows, setGuildRows] = useState<GuildUsageRow[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [dashRes, guildRes] = await Promise.all([
        fetch(`/api/platform/dashboard?period=${period}`),
        fetch("/api/platform/guilds?period=7d"),
      ])
      const dashJson = await dashRes.json()
      const guildJson = await guildRes.json()

      if (!dashRes.ok || !dashJson.ok) {
        throw new Error(dashJson.message ?? "대시보드 조회 실패")
      }
      if (!guildRes.ok || !guildJson.ok) {
        throw new Error(guildJson.message ?? "혈맹 현황 조회 실패")
      }

      setDashboard(dashJson.dashboard)
      setGuildRows(guildJson.guilds)
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패")
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const kpis = dashboard?.kpis
  const featureUsage: FeatureUsageStat[] = dashboard?.featureUsage ?? []
  const recentGuilds: RecentGuildRow[] = dashboard?.recentGuilds ?? []

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">서비스 운영 현황</h1>
            <p className="text-xs text-muted-foreground">Platform Admin · {displayName}</p>
          </div>
          <a href="/" className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            혈맹 앱으로
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {dashboard?.analyticsSinceNote && (
          <p className="mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {dashboard.analyticsSinceNote}
          </p>
        )}

        {error && (
          <p className="mb-4 text-sm text-destructive">{error}</p>
        )}

        {loading && !dashboard ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : kpis ? (
          <>
            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">핵심 지표</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
                <KpiCard label="총 등록 혈맹" value={kpis.totalGuilds} />
                <KpiCard label="총 등록 혈맹원" value={kpis.totalMembers} />
                <KpiCard label="오늘 로그인 사용자" value={kpis.todayLoginUsers} />
                <KpiCard label="7일 활성 사용자" value={kpis.activeUsers7d} />
                <KpiCard label="30일 활성 사용자" value={kpis.activeUsers30d} />
                <KpiCard label="7일 활성 혈맹" value={kpis.activeGuilds7d} />
                <KpiCard label="30일 활성 혈맹" value={kpis.activeGuilds30d} />
                <KpiCard label="오늘 신규 혈맹" value={kpis.newGuildsToday} />
                <KpiCard label="7일 신규 혈맹" value={kpis.newGuilds7d} />
                <KpiCard label="30일 신규 혈맹" value={kpis.newGuilds30d} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                누적 보스 이벤트 {kpis.cumulativeBossEvents.toLocaleString("ko-KR")} · 누적 정산{" "}
                {kpis.cumulativeSettlements.toLocaleString("ko-KR")} (기존 DB 기준)
              </p>
            </section>

            <section className="mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-medium text-muted-foreground">기능 사용량</h2>
                <div className="flex gap-1">
                  {PERIOD_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPeriod(opt.value)}
                      className={`rounded px-2 py-0.5 text-xs ${
                        period === opt.value
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">기능</th>
                      <th className="px-3 py-2 font-medium text-right">이벤트</th>
                      <th className="px-3 py-2 font-medium text-right">고유 사용자</th>
                      <th className="px-3 py-2 font-medium text-right">고유 혈맹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureUsage.map((row) => (
                      <tr key={row.eventType} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">{row.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.eventCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.uniqueUsers}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.uniqueGuilds}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">최근 생성 혈맹</h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">서버</th>
                      <th className="px-3 py-2 font-medium">혈맹명</th>
                      <th className="px-3 py-2 font-medium text-right">혈맹원</th>
                      <th className="px-3 py-2 font-medium">생성</th>
                      <th className="px-3 py-2 font-medium">온보딩</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentGuilds.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                          데이터 없음
                        </td>
                      </tr>
                    ) : (
                      recentGuilds.map((g) => (
                        <tr key={g.guildId} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2">{g.serverName}</td>
                          <td className="px-3 py-2">{g.guildName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.memberCount}명</td>
                          <td className="px-3 py-2 text-xs">{formatDateTime(g.createdAt)}</td>
                          <td className="px-3 py-2 text-xs">
                            {g.onboardingCompleted ? "완료" : "미완료"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">혈맹별 사용 현황</h2>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">서버</th>
                      <th className="px-3 py-2 font-medium">혈맹명</th>
                      <th className="px-3 py-2 font-medium text-right">혈맹원</th>
                      <th className="px-3 py-2 font-medium">마지막 활동</th>
                      <th className="px-3 py-2 font-medium text-right">7일 로그인</th>
                      <th className="px-3 py-2 font-medium text-right">7일 보스</th>
                      <th className="px-3 py-2 font-medium text-right">7일 공성</th>
                      <th className="px-3 py-2 font-medium text-right">7일 정산</th>
                      <th className="px-3 py-2 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {guildRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">
                          데이터 없음
                        </td>
                      </tr>
                    ) : (
                      guildRows.map((g) => (
                        <tr key={g.guildId} className="border-b border-border/60 last:border-0">
                          <td className="px-3 py-2">{g.serverName}</td>
                          <td className="px-3 py-2">{g.guildName}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.memberCount}</td>
                          <td className="px-3 py-2 text-xs">
                            {g.lastActivityAt ? formatDateTime(g.lastActivityAt) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.loginUsers7d}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.bossParticipation7d}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.siegeParticipation7d}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{g.settlementCreated7d}</td>
                          <td className={`px-3 py-2 text-xs font-medium ${statusClass(g.status)}`}>
                            {statusLabel(g.status)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  )
}
