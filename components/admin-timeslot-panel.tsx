"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  Copy,
  RefreshCw,
  UserPlus,
  UserMinus,
  Search,
  CheckCircle2,
  Radio,
  Lock,
  ChevronDown,
  ChevronRight,
} from "lucide-react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import {
  useParticipation,
  formatCheckTime,
  type Attendee,
} from "@/components/participation-context"
import { useMembers } from "@/components/members-context"
import { useSettlement } from "@/components/settlement-context"
import { type RosterMember } from "@/lib/member-types"
import { bossApi } from "@/lib/operations-api"
import {
  MAIN_EXTRA_BOSSES,
  MAIN_FIXED_BOSSES,
  generateDaySlots,
  getSlotBossSummary,
  hourDistanceFromNow,
  type BossTimeSlot,
} from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"
import { trackInteraction } from "@/lib/interaction-perf"

const MEMO_PRESETS = ["늦게 합류 / 참여 인정", "중간 이탈", "참여체크 누락 확인"] as const

type AdminTimeslotPanelProps = {
  slotId?: string
  embedded?: boolean
}

function resolveSlot(slots: BossTimeSlot[], slotId: string): BossTimeSlot | undefined {
  const fromToday = slots.find((s) => s.id === slotId)
  if (fromToday) return fromToday
  const date = slotId.slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return generateDaySlots(date).find((s) => s.id === slotId)
  }
  return undefined
}

export function AdminTimeslotPanel({ slotId: controlledSlotId, embedded = false }: AdminTimeslotPanelProps = {}) {
  const {
    slots,
    getCheck,
    getSlotAdminFlags,
    startCheck,
    closeCheck,
    regenerateCode,
    addAttendeeManual,
    removeAttendeeManual,
    setExtraMainBosses,
    openSlotId,
    loadError,
    retryLoad,
    applyBossPatch,
    isMutationPending,
  } = useParticipation()
  const { getRosterMembers } = useMembers()
  const { getBossSettlement, reviseSettlement } = useSettlement()
  const rosterForCheck = getRosterMembers()

  const [internalSlotId, setInternalSlotId] = useState<string>(() => {
    const now = new Date().getHours()
    const closest = [...slots].sort(
      (a, b) => hourDistanceFromNow(a.hour, now) - hourDistanceFromNow(b.hour, now),
    )[0]
    return closest?.id ?? slots[0]?.id ?? ""
  })
  const selectedSlotId = controlledSlotId ?? internalSlotId
  const setSelectedSlotId = controlledSlotId ? () => {} : setInternalSlotId

  const starting = isMutationPending(`boss-start:${selectedSlotId}`)
  const closing = isMutationPending(`boss-close:${selectedSlotId}`)
  const regenerating = isMutationPending(`boss-regenerate:${selectedSlotId}`)
  const extraBossSaving = isMutationPending(`boss-extra-boss:${selectedSlotId}`)
  const manualPending = isMutationPending(`boss-manual:${selectedSlotId}`)

  const [search, setSearch] = useState("")
  const [memoModal, setMemoModal] = useState<{
    action: "add" | "remove"
    member: RosterMember
  } | null>(null)
  const [memoText, setMemoText] = useState("")
  const [participantsExpanded, setParticipantsExpanded] = useState(false)
  const [nonParticipantsExpanded, setNonParticipantsExpanded] = useState(false)
  const [multiAddOpen, setMultiAddOpen] = useState(false)
  const [multiAddSearch, setMultiAddSearch] = useState("")
  const [multiAddSelected, setMultiAddSelected] = useState<Set<string>>(() => new Set())
  const [multiAddMemo, setMultiAddMemo] = useState("")
  const [batchAdding, setBatchAdding] = useState(false)

  const selectedSlot = resolveSlot(slots, selectedSlotId) ?? slots[0]!
  const check = getCheck(selectedSlotId)
  const flags = getSlotAdminFlags(selectedSlotId)
  const settlement = getBossSettlement(selectedSlotId)
  const isOpen = check.status === "open"
  const isClosed = check.status === "closed"
  const canStartParticipationCheck =
    check.status === "idle" ||
    (isClosed && !flags.noIncomeClosed && !flags.incomeDeclared && !settlement)
  const blockedByOtherOpenSlot =
    !!openSlotId && openSlotId !== selectedSlotId && check.status !== "open"

  const filteredAttendees = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return check.attendees
    return check.attendees.filter((a) => a.name.toLowerCase().includes(q))
  }, [check.attendees, search])

  const allNonAttendees = useMemo(() => {
    const joinedIds = new Set(check.attendees.map((a) => a.memberId))
    return rosterForCheck.filter((m) => !joinedIds.has(m.id))
  }, [check.attendees, rosterForCheck])

  const filteredNonAttendees = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allNonAttendees
    return allNonAttendees.filter((m) => m.nickname.toLowerCase().includes(q))
  }, [allNonAttendees, search])

  const multiAddCandidates = useMemo(() => {
    const q = multiAddSearch.trim().toLowerCase()
    if (!q) return allNonAttendees
    return allNonAttendees.filter((m) => m.nickname.toLowerCase().includes(q))
  }, [allNonAttendees, multiAddSearch])

  async function handleStart() {
    if (starting || !canStartParticipationCheck) return
    await startCheck(selectedSlotId)
  }

  function handleClose() {
    if (closing) return
    const count = check.attendees.length
    const msg = `${selectedSlot.time} 참여체크를 마감하시겠습니까?\n현재 참여인원 ${count}명`
    if (window.confirm(msg)) {
      void closeCheck(selectedSlotId)
    }
  }

  function handleRegenerate() {
    if (regenerating) return
    if (
      window.confirm(
        "참여코드를 재생성하시겠습니까?\n기존 코드는 즉시 무효화되며, 새 코드만 유효합니다.",
      )
    ) {
      void regenerateCode(selectedSlotId)
    }
  }

  async function handleCopyCode() {
    if (!check.code) return
    try {
      await navigator.clipboard.writeText(check.code)
      alert("참여코드가 복사되었습니다.")
    } catch {
      alert(`복사 실패. 코드: ${check.code}`)
    }
  }

  function toggleExtraBoss(name: string) {
    const current = check.extraMainBosses
    const next = current.includes(name) ? current.filter((b) => b !== name) : [...current, name]
    setExtraMainBosses(selectedSlotId, next)
  }

  async function submitMemo() {
    if (!memoModal || !memoText.trim() || manualPending) return

    const settlement = getBossSettlement(selectedSlotId)
    const memo = memoText.trim()

    if (memoModal.action === "add") {
      const manualResult = await addAttendeeManual(selectedSlotId, memoModal.member, memo)
      if (!manualResult.ok) {
        alert(manualResult.message)
        return
      }
    } else {
      const manualResult = await removeAttendeeManual(selectedSlotId, memoModal.member, memo)
      if (!manualResult.ok) {
        alert(manualResult.message)
        return
      }
    }

    if (settlement && isClosed) {
      const r = await reviseSettlement("boss", selectedSlotId, [], memo)
      if (!r.ok) alert(r.message)
    }

    setMemoModal(null)
    setMemoText("")
  }

  function openMultiAdd() {
    setMultiAddOpen(true)
    setMultiAddSearch("")
    setMultiAddSelected(new Set())
    setMultiAddMemo("")
  }

  function toggleMultiAddMember(memberId: string) {
    setMultiAddSelected((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  async function submitBatchAdd() {
    const memo = multiAddMemo.trim()
    if (!memo) return

    const selectedMembers = allNonAttendees.filter((m) => multiAddSelected.has(m.id))
    if (selectedMembers.length === 0) return

    setBatchAdding(true)
    const tracker = trackInteraction("boss-manual-batch")
    tracker.markPending()
    try {
      const result = await bossApi.manualParticipationBatch({
        slotId: selectedSlotId,
        memo,
        batch: selectedMembers.map((member) => ({
          memberId: member.id,
          action: "add" as const,
          memo,
        })),
      })

      if (result.ok) {
        applyBossPatch(result.patch)
      }

      const successCount = result.results?.filter((r) => r.ok).length ?? 0
      const failedMembers = selectedMembers.filter(
        (m) => result.results?.find((r) => r.memberId === m.id && !r.ok),
      )
      const failureMessages =
        result.results?.filter((r) => !r.ok).map((r) => {
          const member = selectedMembers.find((m) => m.id === r.memberId)
          return `${member?.nickname ?? r.memberId}: ${r.message}`
        }) ?? []

      if (successCount > 0) {
        const settlementAfter = getBossSettlement(selectedSlotId)
        if (settlementAfter && isClosed) {
          const r = await reviseSettlement("boss", selectedSlotId, [], memo)
          if (!r.ok) {
            failureMessages.push(`정산 갱신: ${r.message}`)
          }
        }
      }

      if (failedMembers.length === 0 && failureMessages.length === 0) {
        tracker.finish({ ok: true })
        setMultiAddOpen(false)
        setMultiAddSelected(new Set())
        setMultiAddMemo("")
        setMultiAddSearch("")
        return
      }

      const summary =
        failureMessages.length > 0
          ? `${successCount}명 추가 완료 / ${failedMembers.length}명 실패`
          : `${successCount}명 추가 완료`

      alert([summary, ...failureMessages].join("\n"))
      tracker.finish({ ok: successCount > 0 })

      if (failedMembers.length > 0) {
        setMultiAddSelected(new Set(failedMembers.map((m) => m.id)))
      } else {
        setMultiAddOpen(false)
        setMultiAddSelected(new Set())
        setMultiAddMemo("")
        setMultiAddSearch("")
      }
    } finally {
      setBatchAdding(false)
    }
  }

  return (
    <div>
      {!embedded && (
        <SectionTitle
          action={
            openSlotId ? (
              <Badge tone="warning">
                <Radio className="mr-1 inline h-3 w-3" />
                체크 진행 중
              </Badge>
            ) : null
          }
        >
          보스타임 참여관리
        </SectionTitle>
      )}

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

      {!embedded && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {slots.map((slot) => {
            const sc = getCheck(slot.id)
            const active = slot.id === selectedSlotId
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setSelectedSlotId(slot.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-secondary text-muted-foreground",
                )}
              >
                {slot.time}
                {sc.status === "open" && " ●"}
                {sc.status === "closed" && " ✓"}
              </button>
            )
          })}
        </div>
      )}

      <Card className="mb-3">
        <SlotHeader slot={selectedSlot} check={check} />
        {selectedSlot.type === "main" && (
          <MainBossSelector
            selected={check.extraMainBosses}
            onToggle={toggleExtraBoss}
            disabled={extraBossSaving}
            saving={extraBossSaving}
          />
        )}
      </Card>

      {/* Idle / 재시작 가능 */}
      {canStartParticipationCheck && !isOpen && (
        <>
          {blockedByOtherOpenSlot && (
            <p className="mb-2 text-xs text-warning">
              다른 타임에 진행 중인 참여체크가 있습니다. 시작하면 해당 체크는 자동 마감됩니다.
            </p>
          )}
          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting
              ? "시작 중..."
              : isClosed
                ? "참여체크 다시 시작"
                : "참여체크 시작"}
          </button>
        </>
      )}

      {/* Open state */}
      {isOpen && (
        <div className="flex flex-col gap-3">
          <Card className="text-center">
            <p className="text-xs text-muted-foreground">참여코드 (운영진 전용)</p>
            <p className="mt-1 font-mono text-4xl font-bold tracking-[0.3em] text-foreground">
              {check.code}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleCopyCode}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <Copy className="h-3.5 w-3.5" />
                코드 복사
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
                {regenerating ? "재생성 중…" : "코드 재생성"}
              </button>
            </div>
          </Card>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-sm text-muted-foreground">현재 참여인원</span>
            <span className="text-lg font-semibold text-foreground">{check.attendees.length}명</span>
          </div>

          <AttendeeSection
            search={search}
            onSearchChange={setSearch}
            attendees={filteredAttendees}
            attendeeCount={check.attendees.length}
            nonAttendees={filteredNonAttendees}
            nonAttendeeCount={allNonAttendees.length}
            roster={rosterForCheck}
            participantsExpanded={participantsExpanded}
            onParticipantsExpandedChange={setParticipantsExpanded}
            nonParticipantsExpanded={nonParticipantsExpanded}
            onNonParticipantsExpandedChange={setNonParticipantsExpanded}
            onOpenMultiAdd={openMultiAdd}
            onAdd={(m) => {
              setMemoModal({ action: "add", member: m })
              setMemoText("")
            }}
            onRemove={(m) => {
              setMemoModal({ action: "remove", member: m })
              setMemoText("")
            }}
          />

          <button
            type="button"
            onClick={handleClose}
            disabled={closing}
            className="w-full rounded-xl border border-destructive/40 bg-destructive/10 py-3 text-sm font-semibold text-destructive transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {closing ? "마감 중…" : "참여체크 마감"}
          </button>
        </div>
      )}

      {/* Closed state */}
      {isClosed && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-success">
            <Lock className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-sm font-semibold">참여 확정 {check.attendees.length}명</p>
              <p className="text-xs opacity-80">
                {check.closedAt ? `마감 ${formatCheckTime(check.closedAt)}` : "마감됨"}
              </p>
            </div>
          </div>

          <AttendeeSection
            search={search}
            onSearchChange={setSearch}
            attendees={filteredAttendees}
            attendeeCount={check.attendees.length}
            nonAttendees={filteredNonAttendees}
            nonAttendeeCount={allNonAttendees.length}
            roster={rosterForCheck}
            participantsExpanded={participantsExpanded}
            onParticipantsExpandedChange={setParticipantsExpanded}
            nonParticipantsExpanded={nonParticipantsExpanded}
            onNonParticipantsExpandedChange={setNonParticipantsExpanded}
            onOpenMultiAdd={openMultiAdd}
            onAdd={(m) => {
              setMemoModal({ action: "add", member: m })
              setMemoText("")
            }}
            onRemove={(m) => {
              setMemoModal({ action: "remove", member: m })
              setMemoText("")
            }}
          />

          {check.adminLogs.length > 0 && (
            <>
              <SectionTitle>수동 수정 기록</SectionTitle>
              <div className="flex flex-col gap-2">
                {check.adminLogs.map((log) => (
                  <Card key={log.id} className="py-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{log.targetName}</span>
                      <Badge tone={log.action === "수동추가" ? "success" : "danger"}>
                        {log.beforeState} → {log.afterState}
                      </Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{log.memo}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {formatCheckTime(log.at)}
                    </p>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Multi-add modal */}
      {multiAddOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="text-sm font-semibold text-foreground">참여자 수동 추가</p>
            <p className="mt-1 text-xs text-muted-foreground">
              미참여 혈원 {allNonAttendees.length}명 중 선택 · {multiAddSelected.size}명 선택됨
            </p>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={multiAddSearch}
                onChange={(e) => setMultiAddSearch(e.target.value)}
                placeholder="캐릭터명 검색..."
                className="w-full rounded-xl border border-border bg-input py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-border">
              {multiAddCandidates.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  {allNonAttendees.length === 0 ? "미참여 혈원이 없습니다." : "검색 결과가 없습니다."}
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {multiAddCandidates.map((m) => {
                    const checked = multiAddSelected.has(m.id)
                    return (
                      <li key={m.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMultiAddMember(m.id)}
                            className="h-4 w-4 rounded border-border"
                          />
                          <span className="truncate text-sm font-medium text-foreground">{m.nickname}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {MEMO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMultiAddMemo(preset)}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {preset}
                </button>
              ))}
            </div>

            <textarea
              value={multiAddMemo}
              onChange={(e) => setMultiAddMemo(e.target.value)}
              placeholder="관리자 메모 (필수)..."
              rows={2}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMultiAddOpen(false)
                  setMultiAddSelected(new Set())
                  setMultiAddMemo("")
                  setMultiAddSearch("")
                }}
                className="flex-1 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void submitBatchAdd()}
                disabled={batchAdding || multiAddSelected.size === 0 || !multiAddMemo.trim()}
                className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {batchAdding
                  ? "추가 중..."
                  : `선택한 ${multiAddSelected.size}명 추가`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Memo modal */}
      {memoModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
            <p className="text-sm font-semibold text-foreground">
              {memoModal.action === "add" ? "참여자 수동 추가" : "참여자 제외"} — {memoModal.member.nickname}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">관리자 메모를 입력하세요.</p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {MEMO_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMemoText(preset)}
                  className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {preset}
                </button>
              ))}
            </div>

            <textarea
              value={memoText}
              onChange={(e) => setMemoText(e.target.value)}
              placeholder="메모 입력..."
              rows={3}
              className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setMemoModal(null)
                  setMemoText("")
                }}
                className="flex-1 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submitMemo}
                disabled={!memoText.trim()}
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

function SlotHeader({
  slot,
  check,
}: {
  slot: BossTimeSlot
  check: ReturnType<ReturnType<typeof useParticipation>["getCheck"]>
}) {
  const bossSummary = getSlotBossSummary(slot, check.extraMainBosses)
  return (
    <div>
      <div className="flex items-center gap-2">
        <p className="font-mono text-lg font-semibold text-foreground">{slot.time}</p>
        <Badge tone={slot.type === "main" ? "primary" : "neutral"}>{slot.label}</Badge>
        {check.status === "open" && <Badge tone="warning">체크 중</Badge>}
        {check.status === "closed" && <Badge tone="success">마감</Badge>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">스폰: {bossSummary}</p>
    </div>
  )
}

function MainBossSelector({
  selected,
  onToggle,
  disabled,
  saving = false,
}: {
  selected: string[]
  onToggle: (name: string) => void
  disabled: boolean
  saving?: boolean
}) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        확정 스폰: {MAIN_FIXED_BOSSES.join(" · ")}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-foreground">추가 메인보스 (0~9개)</p>
        {saving && (
          <span className="text-[10px] font-medium text-muted-foreground">저장 중…</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {MAIN_EXTRA_BOSSES.map((name) => {
          const on = selected.includes(name)
          return (
            <button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(name)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                on
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-secondary text-muted-foreground",
              )}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AttendeeSection({
  search,
  onSearchChange,
  attendees,
  attendeeCount,
  nonAttendees,
  nonAttendeeCount,
  roster,
  participantsExpanded,
  onParticipantsExpandedChange,
  nonParticipantsExpanded,
  onNonParticipantsExpandedChange,
  onOpenMultiAdd,
  onAdd,
  onRemove,
}: {
  search: string
  onSearchChange: (v: string) => void
  attendees: Attendee[]
  attendeeCount: number
  nonAttendees: RosterMember[]
  nonAttendeeCount: number
  roster: RosterMember[]
  participantsExpanded: boolean
  onParticipantsExpandedChange: (v: boolean) => void
  nonParticipantsExpanded: boolean
  onNonParticipantsExpandedChange: (v: boolean) => void
  onOpenMultiAdd: () => void
  onAdd: (m: RosterMember) => void
  onRemove: (m: RosterMember) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="명단 검색 (펼친 후)..."
          className="w-full rounded-xl border border-border bg-input py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <CollapsibleListRow
        label="참여자"
        count={attendeeCount}
        expanded={participantsExpanded}
        onToggle={() => onParticipantsExpandedChange(!participantsExpanded)}
      />
      {participantsExpanded && (
        <ScrollableMemberList>
          {attendees.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {attendeeCount === 0 ? "참여자가 없습니다." : "검색 결과가 없습니다."}
            </p>
          ) : (
            attendees.map((a) => (
              <Card key={a.memberId} className="flex items-center gap-3 py-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    체크 {formatCheckTime(a.checkedAt)} · {a.method}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const member = roster.find((m) => m.id === a.memberId)
                    if (member) onRemove(member)
                  }}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-destructive/10 px-2 py-1.5 text-[11px] font-semibold text-destructive"
                >
                  <UserMinus className="h-3 w-3" />
                  제외
                </button>
              </Card>
            ))
          )}
        </ScrollableMemberList>
      )}

      <CollapsibleListRow
        label="미참여 혈원"
        count={nonAttendeeCount}
        expanded={nonParticipantsExpanded}
        onToggle={() => onNonParticipantsExpandedChange(!nonParticipantsExpanded)}
      />
      {nonParticipantsExpanded && (
        <ScrollableMemberList>
          {nonAttendees.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">
              {nonAttendeeCount === 0 ? "미참여 혈원이 없습니다." : "검색 결과가 없습니다."}
            </p>
          ) : (
            nonAttendees.map((m) => (
              <Card key={m.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.nickname}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(m)}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-success/10 px-2 py-1.5 text-[11px] font-semibold text-success"
                >
                  <UserPlus className="h-3 w-3" />
                  추가
                </button>
              </Card>
            ))
          )}
        </ScrollableMemberList>
      )}

      {nonAttendeeCount > 0 && (
        <button
          type="button"
          onClick={onOpenMultiAdd}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 py-2.5 text-sm font-semibold text-primary"
        >
          <UserPlus className="h-4 w-4" />
          참여자 수동 추가
        </button>
      )}
    </div>
  )
}

function CollapsibleListRow({
  label,
  count,
  expanded,
  onToggle,
}: {
  label: string
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50"
    >
      <span className="text-sm font-medium text-foreground">
        {label} {count}명
      </span>
      {expanded ? (
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </button>
  )
}

function ScrollableMemberList({ children }: { children: ReactNode }) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-xl border border-border bg-card/50 p-2">
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}
