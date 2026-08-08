"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import {
  MAIN_EXTRA_BOSSES,
  MAIN_FIXED_BOSSES,
  type BossTimeSlot,
} from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"

const HOME_EXTRA_PREVIEW_COUNT = 3

type BossSpawnBadgesProps = {
  slot: BossTimeSlot
  /** 해당 타임에 관리자가 선택한 추가 메인보스 (highlight용, 로직 변경 없음) */
  selectedExtra?: string[]
  /** home: 접기/요약, full: 전체 목록 */
  variant?: "home" | "full"
  className?: string
}

function FixedBossBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {name}
    </span>
  )
}

function ExtraMainBossBadge({
  name,
  highlighted,
  priority,
}: {
  name: string
  highlighted?: boolean
  /** 홈 미리보기 상위 3종 */
  priority?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-semibold shadow-sm",
        priority
          ? "border-primary/55 bg-primary/22 text-primary"
          : "border-primary/40 bg-primary/14 text-primary",
        highlighted && "ring-2 ring-primary/35 ring-offset-1 ring-offset-background",
      )}
    >
      <Sparkles className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
      {name}
    </span>
  )
}

/** 메인타임: 확정 스폰 3종 + 추가 메인보스 풀. 일반타임: slot.spawnBosses */
export function BossSpawnBadges({
  slot,
  selectedExtra = [],
  variant = "home",
  className,
}: BossSpawnBadgesProps) {
  const [expanded, setExpanded] = useState(false)

  if (slot.type !== "main") {
    return (
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {slot.spawnBosses.map((name) => (
          <span
            key={name}
            className="inline-flex items-center rounded-lg border border-border bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground"
          >
            ★ {name}
          </span>
        ))}
      </div>
    )
  }

  const selectedSet = new Set(selectedExtra)
  const showAllExtra = variant === "full" || expanded
  const visibleExtra = showAllExtra
    ? MAIN_EXTRA_BOSSES
    : MAIN_EXTRA_BOSSES.slice(0, HOME_EXTRA_PREVIEW_COUNT)
  const hiddenExtraCount = MAIN_EXTRA_BOSSES.length - HOME_EXTRA_PREVIEW_COUNT

  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {/* 추가 메인보스 — 시각적 우선 */}
      <div className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/14 via-primary/8 to-transparent p-3">
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-xs font-semibold text-primary">추가 메인보스 {MAIN_EXTRA_BOSSES.length}종</p>
          <p className="text-[10px] font-medium text-primary/75">사전 대기 권장</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleExtra.map((name, index) => (
            <ExtraMainBossBadge
              key={name}
              name={name}
              highlighted={selectedSet.has(name)}
              priority={!showAllExtra && index < HOME_EXTRA_PREVIEW_COUNT}
            />
          ))}
          {variant === "home" && !showAllExtra && hiddenExtraCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="inline-flex items-center rounded-lg border border-primary/45 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/18"
            >
              +{hiddenExtraCount}종
            </button>
          )}
        </div>
        {variant === "home" && expanded && hiddenExtraCount > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 text-[11px] font-semibold text-primary/90"
          >
            접기
          </button>
        )}
      </div>

      {/* 확정 스폰 — 보조 정보 */}
      <div className="px-0.5">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
          확정 스폰
        </p>
        <div className="flex flex-wrap gap-1">
          {MAIN_FIXED_BOSSES.map((name) => (
            <FixedBossBadge key={name} name={name} />
          ))}
        </div>
      </div>
    </div>
  )
}

/** 홈 compact row / boss summary용 한 줄 미리보기 */
export function formatMainBossHomePreview(selectedExtra: string[] = []): string {
  const topExtra = MAIN_EXTRA_BOSSES.slice(0, 3).join(" · ")
  if (selectedExtra.length > 0) {
    return `추가 ${selectedExtra.join(" · ")} · 확정 ${MAIN_FIXED_BOSSES.join(" · ")}`
  }
  return `추가 ${topExtra} 외 ${MAIN_EXTRA_BOSSES.length - 3}종 · 확정 ${MAIN_FIXED_BOSSES.join(" · ")}`
}

/** 일반/메인 슬롯 공통 compact preview */
export function formatSlotBossPreview(
  slot: BossTimeSlot,
  selectedExtra: string[] = [],
): string {
  if (slot.type === "main") {
    return formatMainBossHomePreview(selectedExtra)
  }
  return slot.spawnBosses.join(" · ")
}
