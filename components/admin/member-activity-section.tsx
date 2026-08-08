"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import type { MemberActivityResult } from "@/lib/supabase/member-activity-data"
import { cn } from "@/lib/utils"

type PeriodKey = "this_month" | "last_month" | "all"

type Props = {
  memberId: string
}

type ActivityTab = "boss" | "siege" | "contribution"

export function MemberActivitySection({ memberId }: Props) {
  const [periodKey, setPeriodKey] = useState<PeriodKey>("this_month")
  const [monthPicker, setMonthPicker] = useState("")
  const [tab, setTab] = useState<ActivityTab>("boss")
  const [activity, setActivity] = useState<MemberActivityResult | null>(null)
  const [allTimeSummary, setAllTimeSummary] = useState<MemberActivityResult["summary"] | null>(null)
  const [loading, setLoading] = useState(false)

  const effectivePeriod = monthPicker || periodKey

  const loadActivity = useCallback(async () => {
    setLoading(true)
    const res = await fetch(
      `/api/admin/members/${memberId}/activity?period=${encodeURIComponent(effectivePeriod)}`,
    )
    const data = (await res.json()) as { ok: boolean; activity?: MemberActivityResult }
    if (data.ok && data.activity) setActivity(data.activity)
    setLoading(false)
  }, [memberId, effectivePeriod])

  const loadAllTime = useCallback(async () => {
    const res = await fetch(`/api/admin/members/${memberId}/activity?period=all`)
    const data = (await res.json()) as { ok: boolean; activity?: MemberActivityResult }
    if (data.ok && data.activity) setAllTimeSummary(data.activity.summary)
  }, [memberId])

  useEffect(() => {
    void loadActivity()
  }, [loadActivity])

  useEffect(() => {
    void loadAllTime()
  }, [loadAllTime])

  const summary = activity?.summary

  return (
    <div>
      <SectionTitle>활동 현황</SectionTitle>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <PeriodChip label="이번 달" active={periodKey === "this_month" && !monthPicker} onClick={() => { setPeriodKey("this_month"); setMonthPicker("") }} />
        <PeriodChip label="지난 달" active={periodKey === "last_month" && !monthPicker} onClick={() => { setPeriodKey("last_month"); setMonthPicker("") }} />
        <PeriodChip label="전체" active={periodKey === "all" && !monthPicker} onClick={() => { setPeriodKey("all"); setMonthPicker("") }} />
        <input
          type="month"
          value={monthPicker}
          onChange={(e) => setMonthPicker(e.target.value)}
          className="rounded-full border border-border bg-secondary px-2 py-1 text-[11px]"
        />
      </div>

      <Card className="mb-4 space-y-2 text-sm">
        <p className="text-xs font-medium text-muted-foreground">선택 기간</p>
        {loading || !summary ? (
          <p className="text-xs text-muted-foreground">불러오는 중...</p>
        ) : (
          <>
            <InfoRow label="보스타임 참여" value={`${summary.bossTotal}회`} />
            <InfoRow label="메인 보스타임" value={`${summary.bossMain}회`} />
            <InfoRow label="일반 보스타임" value={`${summary.bossGeneral}회`} />
            <InfoRow label="공성 참여" value={`${summary.siegeTotal}회`} />
            <InfoRow label="기여도" value={`${summary.contributionTotal}점`} highlight />
          </>
        )}
      </Card>

      {allTimeSummary && (
        <Card className="mb-4 space-y-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">전체 누적</p>
          <InfoRow label="보스타임 참여" value={`${allTimeSummary.bossTotal}회`} />
          <InfoRow label="공성 참여" value={`${allTimeSummary.siegeTotal}회`} />
          <InfoRow label="기여도" value={`${allTimeSummary.contributionTotal}점`} highlight />
        </Card>
      )}

      <div className="mb-3 flex gap-1.5">
        <TabChip label="보스" active={tab === "boss"} onClick={() => setTab("boss")} />
        <TabChip label="공성" active={tab === "siege"} onClick={() => setTab("siege")} />
        <TabChip label="기여도" active={tab === "contribution"} onClick={() => setTab("contribution")} />
      </div>

      <div className="flex flex-col gap-2">
        {!activity || loading ? (
          <Card className="py-6 text-center text-xs text-muted-foreground">불러오는 중...</Card>
        ) : tab === "boss" ? (
          activity.bossRecords.length === 0 ? (
            <EmptyCard />
          ) : (
            activity.bossRecords.map((r) => (
              <Card key={r.id} className="py-2.5 text-sm">
                <p className="font-medium">{r.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.slotType === "main" ? "메인" : "일반"} · {r.method} · 참여
                </p>
              </Card>
            ))
          )
        ) : tab === "siege" ? (
          activity.siegeRecords.length === 0 ? (
            <EmptyCard />
          ) : (
            activity.siegeRecords.map((r) => (
              <Card key={r.id} className="py-2.5 text-sm">
                <p className="font-medium">{r.label}</p>
                <p className="text-[11px] text-muted-foreground">실제 참여</p>
              </Card>
            ))
          )
        ) : activity.contributionRecords.length === 0 ? (
          <EmptyCard />
        ) : (
          activity.contributionRecords.map((r) => (
            <Card key={r.id} className="flex items-center justify-between py-2.5">
              <div>
                <p className="text-sm font-medium">
                  {r.date.slice(5).replace("-", "/")} {r.time} {r.label}
                </p>
              </div>
              <span className="font-semibold text-primary">+{r.points}</span>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}

function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(highlight && "font-semibold text-primary")}>{value}</span>
    </div>
  )
}

function PeriodChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-medium",
        active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </button>
  )
}

function TabChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-3 py-1.5 text-xs font-medium",
        active ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </button>
  )
}

function EmptyCard() {
  return <Card className="py-6 text-center text-xs text-muted-foreground">기록 없음</Card>
}
