"use client"

import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Badge, Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { AdminBossParticipantsModal } from "@/components/admin/admin-boss-participants-modal"
import type { AdminNavState } from "@/components/admin/admin-types"
import {
  BOSS_PROCESS_FILTER_LABELS,
  BOSS_PROCESS_STATUS_LABELS,
  matchesBossProcessFilter,
  summarizeBossStatuses,
  type BossProcessFilter,
  type BossProcessStatus,
} from "@/lib/boss-admin-status"
import { getTodayDateString } from "@/lib/boss-time-slots"
import type { BossTimeSlot } from "@/lib/boss-time-slots"
import { useBossDayStatuses } from "@/components/admin/use-boss-slot-status"
import {
  bossSlotNav,
  formatDateLabel,
  shiftDate,
} from "@/components/admin/admin-nav-helpers"
import { cn } from "@/lib/utils"

type Props = {
  date: string
  onNavigate: (nav: AdminNavState) => void
}

const FILTER_ORDER: BossProcessFilter[] = [
  "all",
  "unprocessed",
  "income_pending",
  "settlement_in_progress",
  "completed",
]

function statusTone(status: BossProcessStatus): "neutral" | "warning" | "success" | "primary" | "danger" {
  if (status === "unprocessed") return "warning"
  if (status === "income_pending") return "danger"
  if (status === "settlement_in_progress") return "primary"
  if (status === "no_income_closed" || status === "completed") return "success"
  return "neutral"
}

export function AdminBossDateView({ date, onNavigate }: Props) {
  const [filter, setFilter] = useState<BossProcessFilter>("all")
  const [participantSlot, setParticipantSlot] = useState<BossTimeSlot | null>(null)
  const dayItems = useBossDayStatuses(date)

  const summary = useMemo(
    () => summarizeBossStatuses(dayItems.map((d) => d.status)),
    [dayItems],
  )

  const filtered = useMemo(
    () => dayItems.filter((d) => matchesBossProcessFilter(d.status, filter)),
    [dayItems, filter],
  )

  const today = getTodayDateString()

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "보스타임 관리" },
          { label: formatDateLabel(date) },
        ]}
      />

      <SectionTitle>보스타임 관리</SectionTitle>

      <div className="mb-4 flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
        <button
          type="button"
          onClick={() => onNavigate({ section: "boss", bossDate: shiftDate(date, -1) })}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
          aria-label="이전 날짜"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="font-mono text-sm font-semibold text-foreground">{date}</p>
          {date !== today && (
            <button
              type="button"
              onClick={() => onNavigate({ section: "boss", bossDate: today })}
              className="text-[10px] text-primary"
            >
              오늘로
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onNavigate({ section: "boss", bossDate: shiftDate(date, 1) })}
          className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
          aria-label="다음 날짜"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Card className="mb-4 grid grid-cols-2 gap-2 py-3 text-center text-xs">
        <SummaryChip label="총 타임" value={summary.total} />
        <SummaryChip label="처리완료" value={summary.completed} tone="success" />
        <SummaryChip label="정산 진행" value={summary.settlementInProgress} tone="primary" />
        <SummaryChip label="수익등록필요" value={summary.incomePending} tone="danger" />
        <SummaryChip label="미처리" value={summary.unprocessed} tone="warning" className="col-span-2" />
      </Card>

      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {FILTER_ORDER.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
              filter === f
                ? "border-primary/40 bg-primary/15 text-primary"
                : "border-border bg-secondary text-muted-foreground",
            )}
          >
            {BOSS_PROCESS_FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">
            해당 필터에 맞는 타임이 없습니다.
          </Card>
        )}
        {filtered.map(({ slot, check, status }) => (
          <div
            key={slot.id}
            className="rounded-xl border border-border bg-card transition-colors hover:bg-accent"
          >
            <button
              type="button"
              onClick={() => onNavigate(bossSlotNav(date, slot.id))}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">{slot.time}</p>
                <p className="text-[11px] text-muted-foreground">{slot.label}</p>
              </div>
              <Badge tone={statusTone(status)}>{BOSS_PROCESS_STATUS_LABELS[status]}</Badge>
            </button>
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <button
                type="button"
                onClick={() => setParticipantSlot(slot)}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                참여 {check.attendees.length}명
              </button>
              <span className="text-[10px] text-muted-foreground">클릭하여 참여자 확인</span>
            </div>
          </div>
        ))}
      </div>

      {participantSlot && (
        <AdminBossParticipantsModal
          slot={participantSlot}
          onClose={() => setParticipantSlot(null)}
        />
      )}
    </div>
  )
}

function SummaryChip({
  label,
  value,
  tone,
  className,
}: {
  label: string
  value: number
  tone?: "success" | "primary" | "danger" | "warning"
  className?: string
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "primary"
        ? "text-primary"
        : tone === "danger"
          ? "text-destructive"
          : tone === "warning"
            ? "text-warning"
            : "text-foreground"

  return (
    <div className={className}>
      <p className={cn("text-base font-semibold tabular-nums", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
