"use client"

import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { AdminTimeslotPanel } from "@/components/admin-timeslot-panel"
import { AdminSettlementPanel } from "@/components/admin-settlement-panel"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useParticipation } from "@/components/participation-context"
import { useSettlement } from "@/components/settlement-context"
import { generateDaySlots, type BossTimeSlot } from "@/lib/boss-time-slots"
import { BOSS_PROCESS_STATUS_LABELS } from "@/lib/boss-admin-status"
import { useBossSlotStatus } from "@/components/admin/use-boss-slot-status"
import { bossDateNav, formatDateLabel } from "@/components/admin/admin-nav-helpers"

type Props = {
  date: string
  slotId: string
  onNavigate: (nav: AdminNavState) => void
}

export function AdminBossDetailView({ date, slotId, onNavigate }: Props) {
  const slot = generateDaySlots(date).find((s) => s.id === slotId)

  if (!slot) {
    return (
      <Card className="py-6 text-center text-sm text-muted-foreground">
        타임을 찾을 수 없습니다.
      </Card>
    )
  }

  return <BossDetailContent date={date} slot={slot} slotId={slotId} onNavigate={onNavigate} />
}

function BossDetailContent({
  date,
  slot,
  slotId,
  onNavigate,
}: {
  date: string
  slot: BossTimeSlot
  slotId: string
  onNavigate: (nav: AdminNavState) => void
}) {
  const { getCheck, getSlotAdminFlags, closeSlotWithNoIncome, declareSlotIncome, cancelNoIncomeSlot, loadError, retryLoad } =
    useParticipation()
  const { getBossSettlement } = useSettlement()
  const status = useBossSlotStatus(slot)

  const check = getCheck(slotId)
  const flags = getSlotAdminFlags(slotId)
  const settlement = getBossSettlement(slotId)
  const isClosed = check.status === "closed"
  const showIncomeChoice =
    isClosed && !flags.noIncomeClosed && !flags.incomeDeclared && !settlement
  const showSettlement =
    isClosed && !flags.noIncomeClosed && (flags.incomeDeclared || !!settlement)

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "보스타임 관리", onClick: () => onNavigate(bossDateNav(date)) },
          { label: formatDateLabel(date) },
          { label: slot.time },
        ]}
      />

      <Card className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-lg font-semibold text-foreground">
              {date} {slot.time}
            </p>
            <p className="text-xs text-muted-foreground">{slot.label}</p>
          </div>
          <Badge
            tone={
              status === "unprocessed"
                ? "warning"
                : status === "income_pending"
                  ? "danger"
                  : status === "settlement_in_progress"
                    ? "primary"
                    : "success"
            }
          >
            {BOSS_PROCESS_STATUS_LABELS[status]}
          </Badge>
        </div>
        {isClosed && (
          <p className="mt-2 text-xs text-muted-foreground">
            참여인원 {check.attendees.length}명 · 참여체크 마감
          </p>
        )}
      </Card>

      {showIncomeChoice && (
        <div className="mb-4">
          <SectionTitle>재정 처리</SectionTitle>
          <p className="mb-2 text-xs text-muted-foreground">
            수익이 없었더라도 반드시 마감 처리해주세요.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const r = await closeSlotWithNoIncome(slotId)
                  alert(r.message)
                })()
              }}
              className="rounded-xl border border-border bg-secondary py-3 text-xs font-semibold text-foreground"
            >
              수익 없음으로 마감
            </button>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  const r = await declareSlotIncome(slotId)
                  alert(r.message)
                })()
              }}
              className="rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground"
            >
              수익 발생
            </button>
          </div>
        </div>
      )}

      {flags.noIncomeClosed && (
        <Card className="mb-4 border-success/30 bg-success/10 py-3 text-center text-sm text-success">
          <p>수익 없음 · 처리완료</p>
          {!settlement && (
            <button
              type="button"
              onClick={() => {
                if (!window.confirm("수익 없음 마감을 취소하시겠습니까?")) return
                void (async () => {
                  const r = await cancelNoIncomeSlot(slotId)
                  alert(r.message)
                })()
              }}
              className="mt-2 rounded-lg border border-success/40 bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent"
            >
              수익 없음 마감 취소
            </button>
          )}
        </Card>
      )}

      <SectionTitle>참여자 · 스폰 관리</SectionTitle>
      {loadError && (
        <Card className="mb-3 border-destructive/40 bg-destructive/10 py-3 text-xs text-destructive">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => void retryLoad()}
            className="mt-2 rounded-lg border border-destructive/40 px-3 py-1.5 text-[11px] font-semibold text-destructive hover:bg-destructive/10"
          >
            다시 불러오기
          </button>
        </Card>
      )}
      <AdminTimeslotPanel slotId={slotId} embedded />

      {showSettlement && (
        <>
          <SectionTitle>수익 · 정산</SectionTitle>
          <AdminSettlementPanel slotId={slotId} embedded />
        </>
      )}
    </div>
  )
}
