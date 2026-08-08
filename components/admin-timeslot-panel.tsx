"use client"

import { useMemo, useState } from "react"
import {
  Copy,
  RefreshCw,
  UserPlus,
  UserMinus,
  Search,
  CheckCircle2,
  Radio,
  Lock,
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
import {
  MAIN_EXTRA_BOSSES,
  MAIN_FIXED_BOSSES,
  generateDaySlots,
  getSlotBossSummary,
  hourDistanceFromNow,
  type BossTimeSlot,
} from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"

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
  } = useParticipation()
  const { getRosterMembers } = useMembers()
  const { getBossSettlement, reviseSettlement } = useSettlement()
  const rosterForCheck = getRosterMembers()
  const [starting, setStarting] = useState(false)

  const [internalSlotId, setInternalSlotId] = useState<string>(() => {
    const now = new Date().getHours()
    const closest = [...slots].sort(
      (a, b) => hourDistanceFromNow(a.hour, now) - hourDistanceFromNow(b.hour, now),
    )[0]
    return closest?.id ?? slots[0]?.id ?? ""
  })
  const selectedSlotId = controlledSlotId ?? internalSlotId
  const setSelectedSlotId = controlledSlotId ? () => {} : setInternalSlotId
  const [search, setSearch] = useState("")
  const [memoModal, setMemoModal] = useState<{
    action: "add" | "remove"
    member: RosterMember
  } | null>(null)
  const [memoText, setMemoText] = useState("")

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

  const nonAttendees = useMemo(() => {
    const joinedIds = new Set(check.attendees.map((a) => a.memberId))
    const q = search.trim().toLowerCase()
    return rosterForCheck.filter(
      (m) => !joinedIds.has(m.id) && (!q || m.nickname.toLowerCase().includes(q)),
    )
  }, [check.attendees, search])

  async function handleStart() {
    if (starting || !canStartParticipationCheck) return
    setStarting(true)
    try {
      await startCheck(selectedSlotId)
    } finally {
      setStarting(false)
    }
  }

  function handleClose() {
    const count = check.attendees.length
    const msg = `${selectedSlot.time} 참여체크를 마감하시겠습니까?\n현재 참여인원 ${count}명`
    if (window.confirm(msg)) {
      closeCheck(selectedSlotId)
    }
  }

  function handleRegenerate() {
    if (
      window.confirm(
        "참여코드를 재생성하시겠습니까?\n기존 코드는 즉시 무효화되며, 새 코드만 유효합니다.",
      )
    ) {
      regenerateCode(selectedSlotId)
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
    if (!memoModal || !memoText.trim()) return

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
      // boss revision: 서버가 boss_participations DB에서 최신 참여자를 조회함
      const r = await reviseSettlement("boss", selectedSlotId, [], memo)
      if (!r.ok) alert(r.message)
    }

    setMemoModal(null)
    setMemoText("")
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
            disabled={false}
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
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-secondary py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                코드 재생성
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
            nonAttendees={nonAttendees}
            roster={rosterForCheck}
            onAdd={(m) => {
              setMemoModal({ action: "add", member: m })
              setMemoText("")
            }}
            onRemove={(m) => {
              setMemoModal({ action: "remove", member: m })
              setMemoText("")
            }}
            showAddList
          />

          <button
            type="button"
            onClick={handleClose}
            className="w-full rounded-xl border border-destructive/40 bg-destructive/10 py-3 text-sm font-semibold text-destructive transition-opacity hover:opacity-90"
          >
            참여체크 마감
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
            nonAttendees={nonAttendees}
            roster={rosterForCheck}
            onAdd={(m) => {
              setMemoModal({ action: "add", member: m })
              setMemoText("")
            }}
            onRemove={(m) => {
              setMemoModal({ action: "remove", member: m })
              setMemoText("")
            }}
            showAddList
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
}: {
  selected: string[]
  onToggle: (name: string) => void
  disabled: boolean
}) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        확정 스폰: {MAIN_FIXED_BOSSES.join(" · ")}
      </p>
      <p className="mt-2 text-xs font-medium text-foreground">추가 메인보스 (0~9개)</p>
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
  nonAttendees,
  roster,
  onAdd,
  onRemove,
  showAddList,
}: {
  search: string
  onSearchChange: (v: string) => void
  attendees: Attendee[]
  nonAttendees: RosterMember[]
  roster: RosterMember[]
  onAdd: (m: RosterMember) => void
  onRemove: (m: RosterMember) => void
  showAddList: boolean
}) {
  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="참여자 검색..."
          className="w-full rounded-xl border border-border bg-input py-2.5 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </div>

      <SectionTitle action={<span className="text-xs text-muted-foreground">{attendees.length}명</span>}>
        참여자 명단
      </SectionTitle>
      <div className="flex flex-col gap-2">
        {attendees.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">참여자가 없습니다.</p>
        )}
        {attendees.map((a) => (
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
        ))}
      </div>

      {showAddList && nonAttendees.length > 0 && (
        <>
          <SectionTitle>미참여 혈원</SectionTitle>
          <div className="flex flex-col gap-2">
            {nonAttendees.slice(0, 8).map((m) => (
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
            ))}
          </div>
        </>
      )}
    </>
  )
}
