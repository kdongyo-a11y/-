"use client"

import { useMemo, useState } from "react"
import { Coins, CheckCircle2, Circle, Pencil } from "lucide-react"
import { SectionTitle, Badge, Card, StatCard } from "@/components/ui-bits"
import { useParticipation } from "@/components/participation-context"
import { useSettlement, isSettlementComplete, type SettlementParticipant } from "@/components/settlement-context"
import {
  SettlementParticipantRevisionList,
  SettlementRevisionSummary,
} from "@/components/admin/settlement-revision-ui"
import { calcSettlement } from "@/lib/settlement-utils"
import { formatWon } from "@/lib/guild-data"
import { generateDaySlots } from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"

type AdminSettlementPanelProps = {
  slotId?: string
  embedded?: boolean
}

export function AdminSettlementPanel({ slotId: controlledSlotId, embedded = false }: AdminSettlementPanelProps = {}) {
  const { slots, getCheck } = useParticipation()
  const {
    getBossSettlement,
    getSettlementSummary,
    createSettlement,
    confirmAdminPayment,
    confirmAllAdminPayments,
    adminModifyStatus,
    confirmAdminReturn,
    cancelAdminReturnConfirmation,
    cancelAdminPaymentConfirmation,
    cancelAdditionalAdminPaymentConfirmation,
    confirmAdditionalAdminPayment,
  } = useSettlement()

  const closedSlots = useMemo(
    () => slots.filter((s) => getCheck(s.id).status === "closed"),
    [slots, getCheck],
  )

  const [internalSlotId, setInternalSlotId] = useState<string>(
    () => closedSlots[closedSlots.length - 1]?.id ?? slots[0]?.id ?? "",
  )
  const selectedSlotId = controlledSlotId ?? internalSlotId
  const setSelectedSlotId = controlledSlotId ? () => {} : setInternalSlotId
  const [totalRevenue, setTotalRevenue] = useState("")
  const [guildShare, setGuildShare] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [modifyModal, setModifyModal] = useState<{
    memberId: string
    name: string
    field: "adminPaid" | "memberReceived"
    current: boolean
  } | null>(null)
  const [modifyReason, setModifyReason] = useState("")

  const selectedSlot = useMemo(() => {
    if (controlledSlotId) {
      const fromToday = slots.find((s) => s.id === controlledSlotId)
      if (fromToday) return fromToday
      const date = controlledSlotId.slice(0, 10)
      return generateDaySlots(date).find((s) => s.id === controlledSlotId)
    }
    return slots.find((s) => s.id === selectedSlotId)
  }, [controlledSlotId, slots, selectedSlotId])
  const check = selectedSlot ? getCheck(selectedSlot.id) : null
  const settlement = selectedSlot ? getBossSettlement(selectedSlot.id) : null
  const summary = selectedSlot ? getSettlementSummary("boss", selectedSlot.id) : null

  const preview = useMemo(() => {
    const rev = parseInt(totalRevenue.replace(/\D/g, ""), 10) || 0
    const guild = parseInt(guildShare.replace(/\D/g, ""), 10) || 0
    const count = check?.attendees.length ?? 0
    return calcSettlement({ totalRevenue: rev, guildShareInput: guild, participantCount: count })
  }, [totalRevenue, guildShare, check?.attendees.length])

  async function handleCreate() {
    const rev = parseInt(totalRevenue.replace(/\D/g, ""), 10) || 0
    const guild = parseInt(guildShare.replace(/\D/g, ""), 10) || 0
    const result = await createSettlement(selectedSlotId, rev, guild)
    setFeedback(result.message)
    if (result.ok) {
      setTotalRevenue("")
      setGuildShare("")
    }
  }

  function submitModify() {
    if (!modifyModal || !modifyReason.trim()) return
    adminModifyStatus(
      "boss",
      selectedSlotId,
      modifyModal.memberId,
      modifyModal.field,
      !modifyModal.current,
      modifyReason.trim(),
    )
    setModifyModal(null)
    setModifyReason("")
  }

  if (closedSlots.length === 0 && !embedded) {
    return (
      <div>
        <SectionTitle>분배금 정산</SectionTitle>
        <Card className="py-6 text-center text-sm text-muted-foreground">
          마감된 보스타임이 없습니다. 참여체크 마감 후 정산할 수 있습니다.
        </Card>
      </div>
    )
  }

  if (embedded && controlledSlotId) {
    const checkForSlot = getCheck(controlledSlotId)
    if (checkForSlot.status !== "closed") {
      return (
        <Card className="py-4 text-center text-xs text-muted-foreground">
          참여체크 마감 후 정산할 수 있습니다.
        </Card>
      )
    }
  }

  return (
    <div>
      {!embedded && <SectionTitle>분배금 정산</SectionTitle>}

      {!embedded && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {closedSlots.map((slot) => {
            const hasSettlement = !!getBossSettlement(slot.id)
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => {
                  setSelectedSlotId(slot.id)
                  setFeedback(null)
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedSlotId === slot.id
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-secondary text-muted-foreground",
                )}
              >
                {slot.time}
                {hasSettlement ? " ✓" : ""}
              </button>
            )
          })}
        </div>
      )}

      {selectedSlot && check && !embedded && (
        <Card className="mb-3">
          <p className="font-mono text-lg font-semibold text-foreground">{selectedSlot.time}</p>
          <p className="text-xs text-muted-foreground">
            {selectedSlot.label} · 참여 확정 {check.attendees.length}명
          </p>
        </Card>
      )}

      {!settlement ? (
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">총 수익금</span>
            <input
              type="text"
              inputMode="numeric"
              value={totalRevenue}
              onChange={(e) => setTotalRevenue(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">혈맹 귀속금</span>
            <input
              type="text"
              inputMode="numeric"
              value={guildShare}
              onChange={(e) => setGuildShare(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>

          <Card className="bg-secondary/50 text-xs text-muted-foreground">
            <p>분배대상금 {formatWon(preview.distributableAmount)}</p>
            <p className="mt-1">
              1인 분배 {formatWon(preview.perPersonAmount)} · 잔여 {formatWon(preview.remainder)} →
              혈맹귀속 합계 {formatWon(preview.guildShareFinal)}
            </p>
          </Card>

          {feedback && <p className="text-center text-xs text-muted-foreground">{feedback}</p>}

          <button
            type="button"
            onClick={handleCreate}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            정산 생성
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              label="총 수익"
              value={formatWon(settlement.totalRevenue)}
              tone="primary"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="혈맹 귀속"
              value={formatWon(settlement.guildShareFinal)}
              sub={`입력 ${formatWon(settlement.guildShareInput)} + 잔여 ${formatWon(settlement.remainder)}`}
              tone="success"
              icon={<Coins className="h-3.5 w-3.5" />}
            />
          </div>

          {summary && (
            <Card className="grid grid-cols-3 gap-1 py-3 text-center sm:grid-cols-6">
              <SummaryCell label="전체" value={summary.total} />
              <SummaryCell label="지급완료" value={summary.adminPaid} tone="primary" />
              <SummaryCell label="수령확인" value={summary.memberReceived} tone="warning" />
              <SummaryCell label="최종완료" value={summary.finalComplete} tone="success" />
              <SummaryCell label="반환대기" value={summary.returnPending} tone="warning" />
              <SummaryCell label="추가지급" value={summary.additionalPending} tone="primary" />
            </Card>
          )}

          {settlement.revision > 1 && <SettlementRevisionSummary settlement={settlement} />}

          <div className="flex items-center justify-between">
            <SectionTitle>참여자 분배</SectionTitle>
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  if (!window.confirm("전체 참여자에게 지급완료 처리하시겠습니까?")) return
                  await confirmAllAdminPayments("boss", selectedSlotId)
                })()
              }}
              className="rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary"
            >
              전체 지급완료
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {settlement.revision > 1 ||
            settlement.participants.some((p) => p.adjustmentType !== "none") ? (
              <SettlementParticipantRevisionList
                settlement={settlement}
                sourceType="boss"
                sourceId={selectedSlotId}
                onConfirmAdminReturn={async (memberId) => {
                  const r = await confirmAdminReturn("boss", selectedSlotId, memberId)
                  alert(r.message)
                }}
                onCancelAdminReturn={async (memberId) => {
                  const r = await cancelAdminReturnConfirmation("boss", selectedSlotId, memberId)
                  alert(r.message)
                }}
                onConfirmAdditionalPayment={(memberId) => {
                  confirmAdditionalAdminPayment("boss", selectedSlotId, memberId)
                }}
                onCancelAdditionalPayment={async (memberId) => {
                  const r = await cancelAdditionalAdminPaymentConfirmation("boss", selectedSlotId, memberId)
                  alert(r.message)
                }}
                onConfirmAdminPayment={(memberId) => {
                  void confirmAdminPayment("boss", selectedSlotId, memberId)
                }}
                onCancelAdminPayment={async (memberId) => {
                  const r = await cancelAdminPaymentConfirmation("boss", selectedSlotId, memberId)
                  alert(r.message)
                }}
              />
            ) : (
              settlement.participants.map((p) => (
                <ParticipantRow
                  key={p.memberId}
                  participant={p}
                  onAdminPay={() => {
                    void confirmAdminPayment("boss", selectedSlotId, p.memberId)
                  }}
                  onCancelAdminPay={async () => {
                    if (
                      !window.confirm(
                        "지급 완료 확인을 취소하시겠습니까?\n혈원의 기존 수령 확인 기록은 유지됩니다.",
                      )
                    ) {
                      return
                    }
                    const r = await cancelAdminPaymentConfirmation("boss", selectedSlotId, p.memberId)
                    alert(r.message)
                  }}
                  onModify={(field) =>
                    setModifyModal({
                      memberId: p.memberId,
                      name: p.name,
                      field,
                      current: field === "adminPaid" ? p.adminPaid : p.memberReceived,
                    })
                  }
                />
              ))
            )}
          </div>

          {settlement.modificationLogs.length > 0 && (
            <>
              <SectionTitle>수정 기록</SectionTitle>
              <div className="flex flex-col gap-2">
                {settlement.modificationLogs.map((log) => (
                  <Card key={log.id} className="py-2.5 text-xs">
                    <p className="font-medium text-foreground">
                      {log.targetName} · {log.field === "adminPaid" ? "지급" : "수령"}{" "}
                      {String(log.beforeValue)} → {String(log.afterValue)}
                    </p>
                    <p className="mt-1 text-muted-foreground">{log.reason}</p>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {modifyModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="text-sm font-semibold text-foreground">
              상태 수정 — {modifyModal.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {modifyModal.field === "adminPaid" ? "관리자 지급" : "혈원 수령"}을{" "}
              {modifyModal.current ? "미완료" : "완료"}로 변경합니다.
            </p>
            <textarea
              value={modifyReason}
              onChange={(e) => setModifyReason(e.target.value)}
              placeholder="수정 사유 입력..."
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModifyModal(null)
                  setModifyReason("")
                }}
                className="flex-1 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitModify}
                disabled={!modifyReason.trim()}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "primary" | "success" | "warning" | "danger"
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : tone === "primary"
            ? "text-primary"
            : "text-foreground"

  return (
    <div>
      <p className={cn("text-base font-semibold tabular-nums", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ParticipantRow({
  participant: p,
  onAdminPay,
  onCancelAdminPay,
  onModify,
}: {
  participant: SettlementParticipant
  onAdminPay: () => void
  onCancelAdminPay: () => void
  onModify: (field: "adminPaid" | "memberReceived") => void
}) {
  const complete = isSettlementComplete(p.adminPaid, p.memberReceived)

  return (
    <Card className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
          {complete ? (
            <Badge tone="success">정산 완료</Badge>
          ) : (
            <Badge tone="neutral">진행 중</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{formatWon(p.payoutAmount)}</p>
        <div className="mt-1 flex gap-2 text-[10px]">
          <StatusChip done={p.adminPaid} label="지급" />
          <StatusChip done={p.memberReceived} label="수령" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {!p.adminPaid ? (
          <button
            type="button"
            onClick={onAdminPay}
            className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground"
          >
            지급완료
          </button>
        ) : (
          <>
            <span className="rounded-lg border border-success/30 px-2 py-1 text-center text-[10px] font-medium text-success">
              ✓ 지급 완료
            </span>
            <button
              type="button"
              onClick={onCancelAdminPay}
              className="rounded-lg border border-warning/40 px-2 py-1 text-[10px] font-semibold text-warning"
            >
              지급 완료 취소
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => onModify("memberReceived")}
          className="flex items-center gap-0.5 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground"
        >
          <Pencil className="h-2.5 w-2.5" />
          수령
        </button>
      </div>
    </Card>
  )
}

function StatusChip({ done, label }: { done: boolean; label: string }) {
  return (
    <span className={cn("flex items-center gap-0.5", done ? "text-success" : "text-muted-foreground")}>
      {done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
      {label}
    </span>
  )
}
