"use client"

import { useState } from "react"
import { Clock, Users, CheckCircle2, XCircle, Timer, Star } from "lucide-react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { BossSpawnBadges } from "@/components/boss-spawn-badges"
import { useParticipation, formatCheckTime } from "@/components/participation-context"
import { useSiege } from "@/components/siege-context"
import { useCurrentMemberId } from "@/components/auth-context"
import {
  formatContributionPoints,
  type BossTimeSlot,
} from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"

const filters = ["전체", "참여", "미참여", "대기"] as const

export function BossScreen() {
  const { slots, getCheck, getMemberSlotStatus, getMemberContributionTotal } = useParticipation()
  const { getMemberSiegeContributionTotal } = useSiege()
  const memberId = useCurrentMemberId()
  const [filter, setFilter] = useState<(typeof filters)[number]>("전체")

  const list = slots.filter((slot) => {
    const status = getMemberSlotStatus(slot.id, memberId)
    if (filter === "전체") return true
    if (filter === "참여") return status === "참여"
    if (filter === "미참여") return status === "미참여"
    if (filter === "대기") return status === "대기" || status === "진행중"
    return true
  })

  const contributionTotal =
    getMemberContributionTotal(memberId) + getMemberSiegeContributionTotal(memberId)

  return (
    <div>
      <SectionTitle
        action={
          contributionTotal > 0 ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-primary">
              <Star className="h-3 w-3" />
              기여 {formatContributionPoints(contributionTotal)}
            </span>
          ) : null
        }
      >
        보스타임 일정 · 참여
      </SectionTitle>
      <p className="mb-3 text-xs text-muted-foreground">
        하루 {slots.length}타임 · 일반 {formatContributionPoints(1)} · 메인{" "}
        {formatContributionPoints(1.5)} · 공성 {formatContributionPoints(2)}
      </p>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              filter === f
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {list.map((slot) => (
          <TimeslotCard
            key={slot.id}
            slot={slot}
            check={getCheck(slot.id)}
            myStatus={getMemberSlotStatus(slot.id, memberId)}
            memberId={memberId}
          />
        ))}
        {list.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">해당 조건의 보스타임이 없습니다.</p>
        )}
      </div>
    </div>
  )
}

function TimeslotCard({
  slot,
  check,
  myStatus,
  memberId,
}: {
  slot: BossTimeSlot
  check: ReturnType<ReturnType<typeof useParticipation>["getCheck"]>
  myStatus: ReturnType<ReturnType<typeof useParticipation>["getMemberSlotStatus"]>
  memberId: string
}) {
  const myAttendee = check.attendees.find((a) => a.memberId === memberId)
  const earnedPoints =
    check.status === "closed" && myStatus === "참여" ? slot.contributionPoints : null

  const statusLabel =
    myStatus === "참여"
      ? "참여 완료"
      : myStatus === "미참여"
        ? "미참여"
        : myStatus === "진행중"
          ? "체크 진행 중"
          : "대기"

  const statusTone =
    myStatus === "참여" ? "success" : myStatus === "미참여" ? "danger" : myStatus === "진행중" ? "warning" : "neutral"

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 font-mono text-base font-semibold tabular-nums text-foreground">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {slot.time}
            </span>
            <Badge tone={slot.type === "main" ? "primary" : "neutral"}>{slot.label}</Badge>
            <Badge tone="neutral">{formatContributionPoints(slot.contributionPoints)}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {slot.type === "general" ? slot.spawnBosses.join(" · ") : "출현 몬스터"}
          </p>
        </div>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>

      {slot.type === "main" && (
        <div className="mt-2">
          <BossSpawnBadges
            slot={slot}
            selectedExtra={check.extraMainBosses}
            variant="full"
          />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          <Users className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">참여</span>
          <span className="ml-auto text-sm font-semibold text-foreground">
            {check.status === "idle" ? "—" : `${check.attendees.length}명`}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
          {earnedPoints != null ? (
            <Star className="h-3.5 w-3.5 text-primary" />
          ) : myStatus === "참여" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
          ) : myStatus === "미참여" ? (
            <XCircle className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">
            {earnedPoints != null ? "기여" : "내 상태"}
          </span>
          <span className="ml-auto text-xs font-semibold text-foreground">
            {earnedPoints != null ? formatContributionPoints(earnedPoints) : statusLabel}
          </span>
        </div>
      </div>

      {myAttendee && (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          체크시간 {formatCheckTime(myAttendee.checkedAt)}
        </p>
      )}

      {check.status === "closed" && (
        <div className="mt-2 rounded-lg bg-secondary py-2 text-center text-xs font-medium text-muted-foreground">
          참여 확정 {check.attendees.length}명
          {earnedPoints != null && ` · 기여 ${formatContributionPoints(earnedPoints)}`}
        </div>
      )}
    </Card>
  )
}
