"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Clock, Skull, Users } from "lucide-react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { BossSpawnBadges, formatSlotBossPreview } from "@/components/boss-spawn-badges"
import { useParticipation } from "@/components/participation-context"
import { useNavigation } from "@/components/navigation-context"
import { useCurrentMemberId } from "@/components/auth-context"
import {
  formatTimeUntilSlot,
  getTodayDateString,
  getUpcomingBossSlots,
  type BossTimeSlot,
} from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"

const UPCOMING_PREVIEW_COUNT = 4

export function HomeUpcomingBossSection() {
  const { slots, getCheck, getMemberSlotStatus } = useParticipation()
  const { navigate } = useNavigation()
  const memberId = useCurrentMemberId()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const upcoming = useMemo(
    () => getUpcomingBossSlots(slots, UPCOMING_PREVIEW_COUNT, now),
    [slots, now],
  )

  if (upcoming.length === 0) return null

  const [mainSlot, ...restSlots] = upcoming

  return (
    <div className="mb-4">
      <SectionTitle
        action={
          <button
            type="button"
            onClick={() => navigate("boss")}
            className="flex items-center gap-0.5 text-xs font-medium text-primary"
          >
            전체 일정
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        다가오는 보스타임
      </SectionTitle>

      <UpcomingMainCard
        slot={mainSlot}
        memberId={memberId}
        getCheck={getCheck}
        getMemberSlotStatus={getMemberSlotStatus}
        now={now}
        onDetail={() => navigate("boss")}
      />

      {restSlots.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">다음 일정</p>
          <div className="flex flex-col gap-2">
            {restSlots.map((slot) => (
              <UpcomingCompactRow
                key={slot.id}
                slot={slot}
                getCheck={getCheck}
                now={now}
                onClick={() => navigate("boss")}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function UpcomingMainCard({
  slot,
  memberId,
  getCheck,
  getMemberSlotStatus,
  now,
  onDetail,
}: {
  slot: BossTimeSlot
  memberId: string
  getCheck: ReturnType<typeof useParticipation>["getCheck"]
  getMemberSlotStatus: ReturnType<typeof useParticipation>["getMemberSlotStatus"]
  now: Date
  onDetail: () => void
}) {
  const check = getCheck(slot.id)
  const myStatus = getMemberSlotStatus(slot.id, memberId)

  const today = getTodayDateString()
  const dateLabel = slot.date === today ? "오늘" : `${slot.date.slice(5).replace("-", "/")}`

  return (
    <Card
      className={cn(
        "overflow-hidden border-primary/30 bg-gradient-to-br from-primary/12 via-card to-card p-0",
        slot.type === "main" && "border-primary/40 from-primary/18",
      )}
    >
      <div className="p-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={slot.type === "main" ? "primary" : "neutral"} className="text-[11px]">
                {slot.type === "main" ? "메인타임" : "일반타임"}
              </Badge>
              {check.status === "open" && <Badge tone="warning">체크 중</Badge>}
            </div>
            <p className="mt-2 font-mono text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {slot.time}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {dateLabel} · {slot.label}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium text-primary">{formatTimeUntilSlot(slot, now)}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Skull className="h-3.5 w-3.5 text-primary" />
            출현 몬스터
          </div>
          <BossSpawnBadges
            slot={slot}
            selectedExtra={check.extraMainBosses}
            variant="home"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">내 참여</span>
            <MyParticipationBadge status={myStatus} checkStatus={check.status} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            참여 {check.attendees.length}명
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onDetail}
        className="flex w-full items-center justify-center gap-1 border-t border-border/60 bg-secondary/30 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary/60"
      >
        상세보기
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </Card>
  )
}

function UpcomingCompactRow({
  slot,
  getCheck,
  now,
  onClick,
}: {
  slot: BossTimeSlot
  getCheck: ReturnType<typeof useParticipation>["getCheck"]
  now: Date
  onClick: () => void
}) {
  const check = getCheck(slot.id)
  const bossPreview = formatSlotBossPreview(slot, check.extraMainBosses)

  const today = getTodayDateString()
  const datePrefix = slot.date !== today ? `${slot.date.slice(5).replace("-", "/")} ` : ""

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent"
    >
      <div className="flex flex-col items-center rounded-lg bg-secondary px-2 py-1">
        <Clock className="mb-0.5 h-3 w-3 text-muted-foreground" />
        <span className="font-mono text-xs font-semibold tabular-nums">{slot.time}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {datePrefix}
            {slot.type === "main" ? "메인타임" : "일반타임"}
          </p>
          <Badge tone={slot.type === "main" ? "primary" : "neutral"} className="shrink-0 text-[10px]">
            {formatTimeUntilSlot(slot, now)}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{bossPreview}</p>
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
        {check.attendees.length}명
      </span>
    </button>
  )
}

function MyParticipationBadge({
  status,
  checkStatus,
}: {
  status: ReturnType<ReturnType<typeof useParticipation>["getMemberSlotStatus"]>
  checkStatus: "idle" | "open" | "closed"
}) {
  if (status === "참여") {
    return (
      <Badge tone="success" className="text-[11px]">
        {checkStatus === "closed" ? "참여 완료" : "참여 완료"}
      </Badge>
    )
  }
  if (checkStatus === "open" && status === "진행중") {
    return (
      <Badge tone="warning" className="text-[11px]">
        미참여
      </Badge>
    )
  }
  if (checkStatus === "closed" && status === "미참여") {
    return (
      <Badge tone="neutral" className="text-[11px]">
        미참여
      </Badge>
    )
  }
  return (
    <Badge tone="neutral" className="text-[11px]">
      대기
    </Badge>
  )
}
