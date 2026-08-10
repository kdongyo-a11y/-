"use client"

import { useMemo, useState } from "react"
import {
  UserPlus,
  UserMinus,
  Search,
  Plus,
  Coins,
  CheckCircle2,
  Circle,
  Pencil,
  Shield,
  ClipboardList,
  Users,
} from "lucide-react"
import { SectionTitle, Badge, Card, StatCard } from "@/components/ui-bits"
import {
  useSiege,
  useSiegeRoster,
  getSiegeStatusLabel,
  type SiegeConfirmedAttendee,
  type SiegeStatus,
} from "@/components/siege-context"
import { useSettlement, type SettlementParticipant } from "@/components/settlement-context"
import { formatCheckTime } from "@/components/participation-context"
import {
  SettlementParticipantRevisionList,
  SettlementRevisionSummary,
} from "@/components/admin/settlement-revision-ui"
import { SettlementRoundingPreview } from "@/components/admin/settlement-rounding-preview"
import { useGuildOperationSettings } from "@/components/admin/use-guild-operation-settings"
import { siegeEventOccurredAtIso } from "@/lib/event-occurred-at-utils"
import { calcSettlementPreview } from "@/lib/settlement-preview-utils"
import type { SettlementCalcResult } from "@/lib/settlement-utils"
import { formatWon } from "@/lib/guild-data"
import { type RosterMember } from "@/lib/member-types"
import { getThisWeekSunday, formatSiegeTimeRange } from "@/lib/siege-utils"
import {
  computeSiegeFinancialStatus,
  SIEGE_FINANCIAL_LABELS,
  SIEGE_PARTICIPATION_LABELS,
} from "@/lib/siege-admin-status"
import { cn } from "@/lib/utils"

const ADD_PRESETS = ["늦게 합류", "사전조사 누락", "운영진 확인", "기타"] as const
const REMOVE_PRESETS = ["실제 불참", "중도 이탈", "잘못된 참여확정", "기타"] as const

type AdminSiegePanelProps = {
  siegeId?: string
  embedded?: boolean
}

export function AdminSiegePanel({ siegeId: controlledSiegeId, embedded = false }: AdminSiegePanelProps = {}) {
  const siegeRoster = useSiegeRoster()
  const {
    sieges,
    getSiege,
    getSurveyStats,
    createSiege,
    startSurvey,
    closeSurvey,
    startAttendanceConfirmation,
    finalizeAttendance,
    excludeAttendee,
    addAttendeeManual,
    adminUpdateSurveyResponse,
    getSiegeFinancialFlags,
    closeSiegeWithNoIncome,
    declareSiegeIncome,
  } = useSiege()

  const {
    getSiegeSettlement,
    getSettlementSummary,
    createSiegeSettlement,
    confirmAdminPayment,
    confirmAllAdminPayments,
    adminModifyStatus,
    getSiegeParticipantModifyGuard,
    recalculateSiegeSettlement,
    confirmAdminReturn,
    cancelAdminReturnConfirmation,
    cancelAdminPaymentConfirmation,
    cancelAdditionalAdminPaymentConfirmation,
    confirmAdditionalAdminPayment,
  } = useSettlement()

  const [showAddPicker, setShowAddPicker] = useState(false)

  const [internalSiegeId, setInternalSiegeId] = useState<string>(
    () => sieges[sieges.length - 1]?.id ?? "",
  )
  const selectedSiegeId = controlledSiegeId ?? internalSiegeId
  const setSelectedSiegeId = controlledSiegeId ? () => {} : setInternalSiegeId
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState(getThisWeekSunday())
  const [createStart, setCreateStart] = useState("20:00")
  const [createEnd, setCreateEnd] = useState("21:00")
  const [createMemo, setCreateMemo] = useState("")
  const [createFeedback, setCreateFeedback] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [memoModal, setMemoModal] = useState<{
    action: "exclude" | "add" | "survey"
    member: RosterMember
    surveyResponse?: "참여 예정" | "불참 예정"
  } | null>(null)
  const [memoText, setMemoText] = useState("")

  const [totalRevenue, setTotalRevenue] = useState("")
  const [guildShare, setGuildShare] = useState("")
  const [managementFee, setManagementFee] = useState("")
  const [settlementMemo, setSettlementMemo] = useState("")
  const [settlementFeedback, setSettlementFeedback] = useState<string | null>(null)

  const selectedSiege = getSiege(selectedSiegeId)
  const siegeOccurredAtIso = useMemo(() => {
    if (!selectedSiege) return null
    return siegeEventOccurredAtIso(selectedSiege.eventDate, selectedSiege.startTime)
  }, [selectedSiege])
  const { settings: operationSettings } = useGuildOperationSettings(siegeOccurredAtIso)

  const [modifyModal, setModifyModal] = useState<{
    memberId: string
    name: string
    field: "adminPaid" | "memberReceived"
    current: boolean
  } | null>(null)
  const [modifyReason, setModifyReason] = useState("")

  const surveyStats = selectedSiege ? getSurveyStats(selectedSiege.id) : null
  const settlement = selectedSiege ? getSiegeSettlement(selectedSiege.id) : null
  const summary = selectedSiege ? getSettlementSummary("siege", selectedSiege.id) : null
  const modifyGuard = selectedSiege ? getSiegeParticipantModifyGuard(selectedSiege.id) : null

  const canEditParticipants =
    !!selectedSiege &&
    (selectedSiege.status === "attendance_confirming" ||
      selectedSiege.status === "attendance_confirmed" ||
      selectedSiege.status === "settling") &&
    modifyGuard?.allowed !== false

  const intendedList = useMemo(() => {
    if (!selectedSiege) return []
    const q = search.trim().toLowerCase()
    return selectedSiege.surveyResponses
      .filter((r) => r.response === "참여 예정")
      .filter((r) => !q || r.name.toLowerCase().includes(q))
  }, [selectedSiege, search])

  const confirmedList = useMemo(() => {
    if (!selectedSiege) return []
    const q = search.trim().toLowerCase()
    return selectedSiege.confirmedAttendees.filter(
      (a) => !q || a.name.toLowerCase().includes(q),
    )
  }, [selectedSiege, search])

  const nonConfirmedRoster = useMemo(() => {
    if (!selectedSiege) return []
    const confirmedIds = new Set(selectedSiege.confirmedAttendees.map((a) => a.memberId))
    const q = search.trim().toLowerCase()
    return siegeRoster.filter(
      (m) => !confirmedIds.has(m.id) && (!q || m.nickname.toLowerCase().includes(q)),
    )
  }, [selectedSiege, search, siegeRoster])

  const surveyAdminRoster = useMemo(() => {
    const q = search.trim().toLowerCase()
    return siegeRoster.filter((m) => !q || m.nickname.toLowerCase().includes(q))
  }, [search, siegeRoster])

  const preview = useMemo(() => {
    const rev = parseInt(totalRevenue.replace(/\D/g, ""), 10) || 0
    const guild = parseInt(guildShare.replace(/\D/g, ""), 10) || 0
    const mgmt = parseInt(managementFee.replace(/\D/g, ""), 10) || 0
    const count = selectedSiege?.confirmedAttendees.length ?? 0
    return calcSettlementPreview({
      totalRevenue: rev,
      participantCount: count,
      reserveManualInput: guild,
      managementFeeManualInput: mgmt,
      operationSettings,
    })
  }, [totalRevenue, guildShare, managementFee, selectedSiege?.confirmedAttendees.length, operationSettings])

  async function handleCreateSiege() {
    const result = await createSiege({
      eventDate: createDate,
      startTime: createStart,
      endTime: createEnd,
      memo: createMemo,
    })
    setCreateFeedback(result.message)
    if (result.ok) {
      setShowCreateForm(false)
      setCreateMemo("")
      setSelectedSiegeId(`siege-${createDate}`)
    }
  }

  async function submitMemo() {
    if (!memoModal || !memoText.trim() || !selectedSiege) return

    if (memoModal.action === "exclude" || memoModal.action === "add") {
      const guard = getSiegeParticipantModifyGuard(selectedSiege.id)
      if (!guard.allowed) {
        alert(guard.blockedReason)
        return
      }
      if (guard.needsRevision) {
        const ok = window.confirm(
          "정산이 생성된 상태입니다.\n참여자를 변경하면 정산 수정(차액 정산)이 진행됩니다.",
        )
        if (!ok) return
      }

      const result =
        memoModal.action === "exclude"
          ? await excludeAttendee(selectedSiege.id, memoModal.member, memoText.trim())
          : await addAttendeeManual(selectedSiege.id, memoModal.member, memoText.trim())

      if (!result.ok) {
        alert(result.message)
        return
      }

      if (guard.needsRevision && result.attendees) {
        const recalc = recalculateSiegeSettlement(selectedSiege.id, result.attendees)
        if (!recalc.ok) alert(recalc.message)
      }

      setShowAddPicker(false)
    } else if (memoModal.action === "survey" && memoModal.surveyResponse) {
      adminUpdateSurveyResponse(
        selectedSiege.id,
        memoModal.member,
        memoModal.surveyResponse,
        memoText.trim(),
      )
    }

    setMemoModal(null)
    setMemoText("")
  }

  function openAddMember(member: RosterMember) {
    const guard = getSiegeParticipantModifyGuard(selectedSiege!.id)
    if (!guard.allowed) {
      alert(guard.blockedReason)
      return
    }
    setMemoModal({ action: "add", member })
    setMemoText("")
  }

  function openExcludeMember(member: RosterMember) {
    const guard = getSiegeParticipantModifyGuard(selectedSiege!.id)
    if (!guard.allowed) {
      alert(guard.blockedReason)
      return
    }
    setMemoModal({ action: "exclude", member })
    setMemoText("")
  }

  async function handleCreateSettlement() {
    if (!selectedSiege) return
    const rev = parseInt(totalRevenue.replace(/\D/g, ""), 10) || 0
    const guild = parseInt(guildShare.replace(/\D/g, ""), 10) || 0
    const mgmt = parseInt(managementFee.replace(/\D/g, ""), 10) || 0
    const result = await createSiegeSettlement(
      selectedSiege.id,
      rev,
      guild,
      settlementMemo,
      mgmt,
    )
    setSettlementFeedback(result.message)
    if (result.ok) {
      setTotalRevenue("")
      setGuildShare("")
      setManagementFee("")
      setSettlementMemo("")
    }
  }

  function submitModify() {
    if (!modifyModal || !modifyReason.trim() || !selectedSiege) return
    adminModifyStatus(
      "siege",
      selectedSiege.id,
      modifyModal.memberId,
      modifyModal.field,
      !modifyModal.current,
      modifyReason.trim(),
    )
    setModifyModal(null)
    setModifyReason("")
  }

  const canSettle =
    selectedSiege &&
    (selectedSiege.status === "attendance_confirmed" || selectedSiege.status === "settling")

  const financialFlags = selectedSiege ? getSiegeFinancialFlags(selectedSiege.id) : null
  const financialStatus =
    selectedSiege && financialFlags
      ? computeSiegeFinancialStatus({
          flags: financialFlags,
          attendanceReady:
            selectedSiege.status === "attendance_confirmed" ||
            selectedSiege.status === "settling" ||
            selectedSiege.status === "completed",
          hasSettlement: !!settlement,
          settlementParticipants: settlement?.participants ?? [],
        })
      : null

  return (
    <div>
      {!embedded && (
        <>
          <SectionTitle>공성 관리</SectionTitle>
          <p className="mb-3 text-[11px] text-muted-foreground">
            보스타임과 별도의 주간 공성 이벤트입니다. 매주 일요일 20:00 ~ 21:00.
          </p>
        </>
      )}

      {!embedded && (
        <>
          {!showCreateForm ? (
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(true)
                setCreateDate(getThisWeekSunday())
                setCreateFeedback(null)
              }}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
            >
              <Plus className="h-4 w-4" />
              공성 참여 생성
            </button>
          ) : (
            <CreateForm
              createDate={createDate}
              createStart={createStart}
              createEnd={createEnd}
              createMemo={createMemo}
              createFeedback={createFeedback}
              onDateChange={setCreateDate}
              onStartChange={setCreateStart}
              onEndChange={setCreateEnd}
              onMemoChange={setCreateMemo}
              onCancel={() => setShowCreateForm(false)}
              onSubmit={handleCreateSiege}
            />
          )}
        </>
      )}

      {sieges.length === 0 ? (
        <Card className="py-6 text-center text-sm text-muted-foreground">
          생성된 공성이 없습니다.
        </Card>
      ) : (
        <>
          {!embedded && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {sieges.map((siege) => (
                <button
                  key={siege.id}
                  type="button"
                  onClick={() => {
                    setSelectedSiegeId(siege.id)
                    setSettlementFeedback(null)
                  }}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    selectedSiegeId === siege.id
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border bg-secondary text-muted-foreground",
                  )}
                >
                  {siege.eventDate.slice(5)}
                </button>
              ))}
            </div>
          )}

          {selectedSiege && surveyStats && (
            <>
              <Card className="mb-3">
                <div className="flex items-start gap-2">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">이번 주 공성</p>
                    <p className="font-semibold text-foreground">{selectedSiege.eventDate} 공성</p>
                    <p className="font-mono text-sm text-muted-foreground">
                      일요일 {formatSiegeTimeRange(selectedSiege.startTime, selectedSiege.endTime)}
                    </p>
                    <Badge tone="neutral" className="mt-2">
                      {getSiegeStatusLabel(selectedSiege.status)}
                    </Badge>
                    {financialStatus && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone="primary">
                          참여: {SIEGE_PARTICIPATION_LABELS[selectedSiege.status] ?? selectedSiege.status}
                        </Badge>
                        <Badge
                          tone={
                            financialStatus === "completed" || financialStatus === "no_income_closed"
                              ? "success"
                              : financialStatus === "pending"
                                ? "warning"
                                : "neutral"
                          }
                        >
                          재정: {SIEGE_FINANCIAL_LABELS[financialStatus]}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>

                <ProgressSteps
                  status={selectedSiege.status}
                  surveyStats={surveyStats}
                  confirmedCount={selectedSiege.confirmedAttendees.length}
                  settlement={settlement}
                  summary={summary}
                />
              </Card>

              {/* ① 참여조사 */}
              <SectionTitle>① 참여조사</SectionTitle>

              {selectedSiege.status === "draft" && (
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const r = await startSurvey(selectedSiege.id)
                      if (!r.ok) alert(r.message)
                    })()
                  }}
                  className="mb-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
                >
                  참여조사 시작
                </button>
              )}

              {(selectedSiege.status === "survey_open" ||
                selectedSiege.status === "survey_closed" ||
                selectedSiege.status === "attendance_confirming" ||
                selectedSiege.status === "attendance_confirmed" ||
                selectedSiege.status === "settling" ||
                selectedSiege.status === "completed") && (
                <Card className="mb-3">
                  <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                    <StatMini label="전체" value={surveyStats.total} />
                    <StatMini label="참여 예정" value={surveyStats.intended} tone="primary" />
                    <StatMini label="불참 예정" value={surveyStats.declined} />
                    <StatMini label="미응답" value={surveyStats.noResponse} tone="warning" />
                  </div>

                  {selectedSiege.status === "survey_open" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm(
                            `참여조사를 마감하시겠습니까?\n\n참여 예정 ${surveyStats.intended}명 · 불참 ${surveyStats.declined}명 · 미응답 ${surveyStats.noResponse}명`,
                          )
                        ) {
                          void (async () => {
                            const r = await closeSurvey(selectedSiege.id)
                            if (!r.ok) alert(r.message)
                          })()
                        }
                      }}
                      className="mt-3 w-full rounded-xl border border-destructive/40 bg-destructive/10 py-2.5 text-sm font-semibold text-destructive"
                    >
                      참여조사 마감
                    </button>
                  )}
                </Card>
              )}

              {selectedSiege.status !== "draft" && (
                <>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="참여 예정 명단 검색..."
                      className="w-full rounded-xl border border-border bg-input py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
                    />
                  </div>
                  <SectionTitle action={<Badge tone="primary">{intendedList.length}명</Badge>}>
                    참여 예정 명단
                  </SectionTitle>
                  <div className="mb-4 flex flex-col gap-2">
                    {intendedList.length === 0 ? (
                      <Card className="py-4 text-center text-xs text-muted-foreground">
                        참여 예정 혈원이 없습니다.
                      </Card>
                    ) : (
                      intendedList.map((r) => (
                        <Card key={r.memberId} className="flex items-center justify-between py-2.5">
                          <p className="text-sm font-medium text-foreground">{r.name}</p>
                          <Badge tone="success">참여 예정</Badge>
                        </Card>
                      ))
                    )}
                  </div>

                  {selectedSiege.status === "survey_closed" && (
                    <>
                      <SectionTitle action={<Badge tone="neutral">{surveyAdminRoster.length}명</Badge>}>
                        사전조사 관리자 수정
                      </SectionTitle>
                      <p className="mb-2 text-[11px] text-muted-foreground">
                        마감 후 혈원은 직접 변경할 수 없습니다. 관리자만 상태를 수정할 수 있습니다.
                      </p>
                      <div className="mb-4 max-h-64 overflow-y-auto rounded-xl border border-border bg-card/50 p-2">
                        <div className="flex flex-col gap-2">
                        {surveyAdminRoster.length === 0 ? (
                          <Card className="py-4 text-center text-xs text-muted-foreground">
                            {siegeRoster.length === 0 ? "혈원이 없습니다." : "검색 결과가 없습니다."}
                          </Card>
                        ) : (
                          surveyAdminRoster.map((m) => {
                            const status = selectedSiege.surveyResponses.find(
                              (r) => r.memberId === m.id,
                            )?.response ?? "미응답"
                            return (
                              <Card key={m.id} className="flex items-center justify-between py-2.5">
                                <div>
                                  <p className="text-sm font-medium text-foreground">{m.nickname}</p>
                                  <p className="text-[10px] text-muted-foreground">{status}</p>
                                </div>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMemoModal({
                                        action: "survey",
                                        member: m,
                                        surveyResponse: "참여 예정",
                                      })
                                      setMemoText("")
                                    }}
                                    className="rounded-lg border border-primary/30 px-2 py-1 text-[10px] text-primary"
                                  >
                                    참여
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setMemoModal({
                                        action: "survey",
                                        member: m,
                                        surveyResponse: "불참 예정",
                                      })
                                      setMemoText("")
                                    }}
                                    className="rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground"
                                  >
                                    불참
                                  </button>
                                </div>
                              </Card>
                            )
                          })
                        )}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* ② 실제 참여 */}
              <SectionTitle>② 실제 참여</SectionTitle>

              {selectedSiege.status === "survey_closed" && (
                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const r = await startAttendanceConfirmation(selectedSiege.id)
                      if (!r.ok) alert(r.message)
                      else alert(r.message)
                    })()
                  }}
                  className="mb-3 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
                >
                  실제 참여 확정
                </button>
              )}

              {(selectedSiege.status === "attendance_confirming" ||
                selectedSiege.status === "attendance_confirmed" ||
                selectedSiege.status === "settling" ||
                selectedSiege.status === "completed") && (
                <div className="mb-4 flex flex-col gap-3">
                  <Card className="flex flex-col gap-2 border-success/30 bg-success/10 py-3 text-success">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <p className="text-sm font-semibold">
                        실제 참여 {selectedSiege.confirmedAttendees.length}명
                      </p>
                    </div>
                    {(selectedSiege.status === "attendance_confirmed" ||
                      selectedSiege.status === "settling") && (
                      <p className="text-xs opacity-90">
                        {modifyGuard?.allowed === false
                          ? "수령확인 완료 분배 있음 · 참여자 변경 불가"
                          : settlement
                            ? "참여확정 완료 · 정산 반영 수정 가능"
                            : "참여확정 완료 · 수정 가능"}
                      </p>
                    )}
                  </Card>

                  <SectionTitle action={<Badge tone="success">{confirmedList.length}명</Badge>}>
                    참여 확정 명단
                  </SectionTitle>
                  <div className="flex flex-col gap-2">
                    {confirmedList.map((a) => (
                      <ConfirmedRow
                        key={a.memberId}
                        attendee={a}
                        editable={canEditParticipants}
                        onExclude={() => {
                          const m = siegeRoster.find((x) => x.id === a.memberId)
                          if (m) openExcludeMember(m)
                        }}
                      />
                    ))}
                  </div>

                  {canEditParticipants && (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowAddPicker((v) => !v)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-2.5 text-sm font-semibold text-primary"
                      >
                        <UserPlus className="h-4 w-4" />
                        참여자 추가
                      </button>

                      {showAddPicker && (
                        <div className="flex flex-col gap-2 rounded-xl border border-border bg-secondary/30 p-3">
                          <p className="text-xs font-medium text-muted-foreground">
                            추가할 혈원 선택 · {nonConfirmedRoster.length}명
                          </p>
                          <div className="max-h-64 overflow-y-auto">
                            <div className="flex flex-col gap-2">
                              {nonConfirmedRoster.length === 0 ? (
                                <Card className="py-4 text-center text-xs text-muted-foreground">
                                  {selectedSiege.confirmedAttendees.length >= siegeRoster.length
                                    ? "추가 가능한 혈원이 없습니다."
                                    : "검색 결과가 없습니다."}
                                </Card>
                              ) : (
                                nonConfirmedRoster.map((m) => (
                                  <Card key={m.id} className="flex items-center justify-between py-2.5">
                                    <p className="text-sm text-foreground">{m.nickname}</p>
                                    <button
                                      type="button"
                                      onClick={() => openAddMember(m)}
                                      className="flex items-center gap-1 rounded-lg border border-primary/30 px-2 py-1 text-[10px] text-primary"
                                    >
                                      <UserPlus className="h-3 w-3" />
                                      추가
                                    </button>
                                  </Card>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {selectedSiege.status === "attendance_confirming" && (
                    <button
                      type="button"
                      onClick={() => {
                        void (async () => {
                          const r = await finalizeAttendance(selectedSiege.id)
                          if (!r.ok) alert(r.message)
                          else alert(r.message)
                        })()
                      }}
                      className="w-full rounded-xl border border-success/40 bg-success/10 py-3 text-sm font-semibold text-success"
                    >
                      참여 확정 완료 ({selectedSiege.confirmedAttendees.length}명)
                    </button>
                  )}

                  {(selectedSiege.attendanceChangeLogs.length > 0 ||
                    selectedSiege.manualAdjustments.length > 0) && (
                    <>
                      <SectionTitle>변경 기록</SectionTitle>
                      {selectedSiege.attendanceChangeLogs.map((log) => (
                        <Card key={log.id} className="py-2.5 text-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-foreground">{log.name}</span>
                            <Badge tone={log.changeType === "ADD" ? "success" : "danger"}>
                              {log.changeType}
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">
                            {log.beforeState} → {log.afterState}
                          </p>
                          <p className="mt-1 text-muted-foreground">{log.reason}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">
                            {formatCheckTime(log.changedAt)} · 관리자 {log.adminId}
                          </p>
                        </Card>
                      ))}
                      {selectedSiege.manualAdjustments.map((log) => (
                        <Card key={log.id} className="py-2.5 text-xs">
                          <p className="font-medium text-foreground">
                            [사전조사] {log.targetName} · {log.beforeState} → {log.afterState}
                          </p>
                          <p className="mt-1 text-muted-foreground">{log.memo}</p>
                        </Card>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* ③ 공성 정산 */}
              <SectionTitle>③ 공성 정산</SectionTitle>

              {canSettle &&
                !settlement &&
                financialFlags &&
                !financialFlags.noIncomeClosed &&
                !financialFlags.incomeDeclared && (
                  <div className="mb-3 flex flex-col gap-2">
                    <p className="text-xs text-muted-foreground">
                      실제 참여 확정 후 재정 처리를 선택하세요.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            const r = await closeSiegeWithNoIncome(selectedSiege.id)
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
                            const r = await declareSiegeIncome(selectedSiege.id)
                            alert(r.message)
                          })()
                        }}
                        className="rounded-xl bg-primary py-3 text-xs font-semibold text-primary-foreground"
                      >
                        공성 수익 등록
                      </button>
                    </div>
                  </div>
                )}

              {financialFlags?.noIncomeClosed && !settlement && (
                <Card className="mb-3 border-success/30 bg-success/10 py-4 text-center text-sm text-success">
                  수익 없음 · 처리완료
                </Card>
              )}

              {canSettle && !settlement && financialFlags?.incomeDeclared && (
                <SettlementForm
                  totalRevenue={totalRevenue}
                  guildShare={guildShare}
                  managementFee={managementFee}
                  settlementMemo={settlementMemo}
                  preview={preview}
                  participantCount={selectedSiege.confirmedAttendees.length}
                  feedback={settlementFeedback}
                  operationSettings={operationSettings}
                  onRevenueChange={setTotalRevenue}
                  onGuildChange={setGuildShare}
                  onManagementFeeChange={setManagementFee}
                  onMemoChange={setSettlementMemo}
                  onSubmit={handleCreateSettlement}
                />
              )}

              {settlement && summary && (
                <SettlementView
                  settlement={settlement}
                  summary={summary}
                  siegeId={selectedSiege.id}
                  onConfirmAll={() => {
                    if (window.confirm("전체 지급완료 처리하시겠습니까?")) {
                      confirmAllAdminPayments("siege", selectedSiege.id)
                    }
                  }}
                  onConfirmPay={(memberId) =>
                    confirmAdminPayment("siege", selectedSiege.id, memberId)
                  }
                  onConfirmAdminReturn={async (memberId) => {
                    const r = await confirmAdminReturn("siege", selectedSiege.id, memberId)
                    alert(r.message)
                  }}
                  onCancelAdminReturn={async (memberId) => {
                    const r = await cancelAdminReturnConfirmation("siege", selectedSiege.id, memberId)
                    alert(r.message)
                  }}
                  onConfirmAdditionalPayment={(memberId) =>
                    confirmAdditionalAdminPayment("siege", selectedSiege.id, memberId)
                  }
                  onCancelAdditionalPayment={async (memberId) => {
                    const r = await cancelAdditionalAdminPaymentConfirmation(
                      "siege",
                      selectedSiege.id,
                      memberId,
                    )
                    alert(r.message)
                  }}
                  onCancelAdminPayment={async (memberId) => {
                    const r = await cancelAdminPaymentConfirmation("siege", selectedSiege.id, memberId)
                    alert(r.message)
                  }}
                  onModify={(memberId, name, field, current) =>
                    setModifyModal({ memberId, name, field, current })
                  }
                />
              )}

              {!canSettle && !settlement && selectedSiege.status !== "draft" && (
                <Card className="mb-3 py-4 text-center text-xs text-muted-foreground">
                  실제 참여 확정 후 공성 수익을 등록할 수 있습니다.
                </Card>
              )}
            </>
          )}
        </>
      )}

      {memoModal && (
        <MemoModal
          memoModal={memoModal}
          memoText={memoText}
          onMemoChange={setMemoText}
          onCancel={() => {
            setMemoModal(null)
            setMemoText("")
          }}
          onSubmit={submitMemo}
        />
      )}

      {modifyModal && (
        <ModifyModal
          modifyModal={modifyModal}
          modifyReason={modifyReason}
          onReasonChange={setModifyReason}
          onCancel={() => {
            setModifyModal(null)
            setModifyReason("")
          }}
          onSubmit={submitModify}
        />
      )}
    </div>
  )
}

function ProgressSteps({
  status,
  surveyStats,
  confirmedCount,
  settlement,
  summary,
}: {
  status: SiegeStatus
  surveyStats: { total: number; intended: number }
  confirmedCount: number
  settlement: ReturnType<ReturnType<typeof useSettlement>["getSiegeSettlement"]>
  summary: ReturnType<ReturnType<typeof useSettlement>["getSettlementSummary"]>
}) {
  return (
    <div className="mt-4 space-y-2 border-t border-border pt-4 text-xs">
      <StepRow
        icon={<ClipboardList className="h-3.5 w-3.5" />}
        label="① 참여조사"
        value={`${surveyStats.intended} / ${surveyStats.total}명 참여 예정`}
        active={status === "survey_open" || status === "survey_closed"}
      />
      <StepRow
        icon={<Users className="h-3.5 w-3.5" />}
        label="② 실제 참여"
        value={
          confirmedCount > 0
            ? `최종 ${confirmedCount}명`
            : status === "attendance_confirming"
              ? "확정 진행 중"
              : "대기"
        }
        active={status === "attendance_confirming" || status === "attendance_confirmed"}
      />
      <StepRow
        icon={<Coins className="h-3.5 w-3.5" />}
        label="③ 공성 정산"
        value={
          settlement
            ? `총 ${formatWon(settlement.totalRevenue)} · 1인 ${formatWon(settlement.perPersonAmount)} · 수령 ${summary?.memberReceived ?? 0}/${summary?.total ?? 0}`
            : "미등록"
        }
        active={status === "settling" || status === "completed"}
      />
    </div>
  )
}

function StepRow({
  icon,
  label,
  value,
  active,
}: {
  icon: React.ReactNode
  label: string
  value: string
  active: boolean
}) {
  return (
    <div className={cn("flex items-center gap-2", active ? "text-foreground" : "text-muted-foreground")}>
      <span className={cn("shrink-0", active && "text-primary")}>{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="ml-auto tabular-nums">{value}</span>
    </div>
  )
}

function StatMini({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: "primary" | "warning"
}) {
  return (
    <div>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          tone === "primary" ? "text-primary" : tone === "warning" ? "text-warning" : "text-foreground",
        )}
      >
        {value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function ConfirmedRow({
  attendee,
  editable,
  onExclude,
}: {
  attendee: SiegeConfirmedAttendee
  editable: boolean
  onExclude: () => void
}) {
  return (
    <Card className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium text-foreground">{attendee.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {attendee.method}
          {attendee.wasSurveyIntended ? " · 사전 참여 예정" : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge tone="success">참여 확정</Badge>
        {editable && (
          <button
            type="button"
            onClick={onExclude}
            className="flex items-center gap-1 rounded-lg border border-destructive/30 px-2 py-1 text-[10px] text-destructive"
          >
            <UserMinus className="h-3 w-3" />
            참여 제외
          </button>
        )}
      </div>
    </Card>
  )
}

function CreateForm({
  createDate,
  createStart,
  createEnd,
  createMemo,
  createFeedback,
  onDateChange,
  onStartChange,
  onEndChange,
  onMemoChange,
  onCancel,
  onSubmit,
}: {
  createDate: string
  createStart: string
  createEnd: string
  createMemo: string
  createFeedback: string | null
  onDateChange: (v: string) => void
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  onMemoChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <Card className="mb-3">
      <p className="text-sm font-semibold text-foreground">공성 이벤트 생성</p>
      <div className="mt-3 flex flex-col gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">날짜 (일요일)</span>
          <input
            type="date"
            value={createDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">시작</span>
            <input
              type="time"
              value={createStart}
              onChange={(e) => onStartChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">종료</span>
            <input
              type="time"
              value={createEnd}
              onChange={(e) => onEndChange(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">관리자 메모 (선택)</span>
          <input
            type="text"
            value={createMemo}
            onChange={(e) => onMemoChange(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
          />
        </label>
        {createFeedback && (
          <p className="text-center text-xs text-muted-foreground">{createFeedback}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onSubmit}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            생성
          </button>
        </div>
      </div>
    </Card>
  )
}

function SettlementForm({
  totalRevenue,
  guildShare,
  managementFee,
  settlementMemo,
  preview,
  participantCount,
  feedback,
  operationSettings,
  onRevenueChange,
  onGuildChange,
  onManagementFeeChange,
  onMemoChange,
  onSubmit,
}: {
  totalRevenue: string
  guildShare: string
  managementFee: string
  settlementMemo: string
  preview: SettlementCalcResult
  participantCount: number
  feedback: string | null
  operationSettings: ReturnType<typeof useGuildOperationSettings>["settings"]
  onRevenueChange: (v: string) => void
  onGuildChange: (v: string) => void
  onManagementFeeChange: (v: string) => void
  onMemoChange: (v: string) => void
  onSubmit: () => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">총 공성 수익</span>
        <p className="mt-0.5 text-[10px] text-muted-foreground">1,000원 단위</p>
        <input
          type="text"
          inputMode="numeric"
          value={totalRevenue}
          onChange={(e) => onRevenueChange(e.target.value.replace(/\D/g, ""))}
          className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
        />
      </label>
      {operationSettings?.reserveMode === "manual_per_settlement" && (
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">혈맹 비축금</span>
          <p className="mt-0.5 text-[10px] text-muted-foreground">정산마다 직접 입력 · 1,000원 단위</p>
          <input
            type="text"
            inputMode="numeric"
            value={guildShare}
            onChange={(e) => onGuildChange(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
          />
        </label>
      )}
      {operationSettings?.managementFeeMode === "manual_per_settlement" && (
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">관리비 (총액)</span>
          <p className="mt-0.5 text-[10px] text-muted-foreground">정산마다 직접 입력 · 1,000원 단위</p>
          <input
            type="text"
            inputMode="numeric"
            value={managementFee}
            onChange={(e) => onManagementFeeChange(e.target.value.replace(/\D/g, ""))}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
          />
        </label>
      )}
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">메모 (선택)</span>
        <input
          type="text"
          value={settlementMemo}
          onChange={(e) => onMemoChange(e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2.5 text-sm outline-none focus:border-primary"
        />
      </label>
      <SettlementRoundingPreview
        preview={preview}
        participantCount={participantCount}
        operationSettings={operationSettings}
      />
      {feedback && <p className="text-center text-xs text-muted-foreground">{feedback}</p>}
      <button
        type="button"
        onClick={onSubmit}
        className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground"
      >
        공성 수익 등록
      </button>
    </div>
  )
}

function SettlementView({
  settlement,
  summary,
  siegeId,
  onConfirmAll,
  onConfirmPay,
  onConfirmAdminReturn,
  onCancelAdminReturn,
  onConfirmAdditionalPayment,
  onCancelAdditionalPayment,
  onCancelAdminPayment,
  onModify,
}: {
  settlement: NonNullable<ReturnType<ReturnType<typeof useSettlement>["getSiegeSettlement"]>>
  summary: NonNullable<ReturnType<ReturnType<typeof useSettlement>["getSettlementSummary"]>>
  siegeId: string
  onConfirmAll: () => void
  onConfirmPay: (memberId: string) => void
  onConfirmAdminReturn: (memberId: string) => void
  onCancelAdminReturn: (memberId: string) => void | Promise<void>
  onConfirmAdditionalPayment: (memberId: string) => void
  onCancelAdditionalPayment: (memberId: string) => void | Promise<void>
  onCancelAdminPayment: (memberId: string) => void | Promise<void>
  onModify: (
    memberId: string,
    name: string,
    field: "adminPaid" | "memberReceived",
    current: boolean,
  ) => void
}) {
  return (
    <div className="mb-4 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="총 공성수익" value={formatWon(settlement.totalRevenue)} tone="primary" icon={<Coins className="h-3.5 w-3.5" />} />
        <StatCard label="혈맹 귀속" value={formatWon(settlement.guildShareFinal)} tone="success" icon={<Coins className="h-3.5 w-3.5" />} />
      </div>
      <Card className="grid grid-cols-3 gap-1 py-3 text-center sm:grid-cols-6">
        {(
          [
            ["전체", summary.total],
            ["지급완료", summary.adminPaid],
            ["수령확인", summary.memberReceived],
            ["최종완료", summary.finalComplete],
            ["반환대기", summary.returnPending],
            ["추가지급", summary.additionalPending],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <p className="text-base font-semibold tabular-nums">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </Card>

      {settlement.revision > 1 && <SettlementRevisionSummary settlement={settlement} />}

      <div className="flex items-center justify-between">
        <SectionTitle>참여자 분배</SectionTitle>
        {settlement.revision === 1 && (
          <button
            type="button"
            onClick={onConfirmAll}
            className="rounded-lg border border-primary/40 bg-primary/15 px-2.5 py-1.5 text-[11px] font-semibold text-primary"
          >
            전체 지급완료
          </button>
        )}
      </div>

      {settlement.revision > 1 ? (
        <SettlementParticipantRevisionList
          settlement={settlement}
          sourceType="siege"
          sourceId={siegeId}
          onConfirmAdminReturn={onConfirmAdminReturn}
          onCancelAdminReturn={onCancelAdminReturn}
          onConfirmAdditionalPayment={onConfirmAdditionalPayment}
          onCancelAdditionalPayment={onCancelAdditionalPayment}
          onConfirmAdminPayment={onConfirmPay}
          onCancelAdminPayment={onCancelAdminPayment}
        />
      ) : (
        settlement.participants.map((p) => (
          <ParticipantRow
            key={p.memberId}
            participant={p}
            onAdminPay={() => onConfirmPay(p.memberId)}
            onCancelAdminPay={() => onCancelAdminPayment(p.memberId)}
            onModify={(field) => onModify(p.memberId, p.name, field, field === "adminPaid" ? p.adminPaid : p.memberReceived)}
          />
        ))
      )}
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
  return (
    <Card className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
        <p className="text-xs text-muted-foreground">{formatWon(p.payoutAmount)}</p>
        <div className="mt-1 flex gap-2 text-[10px]">
          <StatusChip done={p.adminPaid} label="지급" />
          <StatusChip done={p.memberReceived} label="수령" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        {!p.adminPaid ? (
          <button type="button" onClick={onAdminPay} className="rounded-lg bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground">
            지급완료
          </button>
        ) : (
          <>
            <span className="rounded-lg border border-success/30 px-2 py-1 text-center text-[10px] font-medium text-success">
              ✓ 지급 완료
            </span>
            <button
              type="button"
              onClick={() => {
                if (
                  !window.confirm(
                    "지급 완료 확인을 취소하시겠습니까?\n혈원의 기존 수령 확인 기록은 유지됩니다.",
                  )
                ) {
                  return
                }
                onCancelAdminPay()
              }}
              className="rounded-lg border border-warning/40 px-2 py-1 text-[10px] font-semibold text-warning"
            >
              지급 완료 취소
            </button>
          </>
        )}
        <button type="button" onClick={() => onModify("memberReceived")} className="flex items-center gap-0.5 rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground">
          <Pencil className="h-2.5 w-2.5" /> 수령
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

function MemoModal({
  memoModal,
  memoText,
  onMemoChange,
  onCancel,
  onSubmit,
}: {
  memoModal: { action: string; member: RosterMember }
  memoText: string
  onMemoChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const presets =
    memoModal.action === "add"
      ? ADD_PRESETS
      : memoModal.action === "exclude"
        ? REMOVE_PRESETS
        : ADD_PRESETS

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
        <p className="text-sm font-semibold text-foreground">
          {memoModal.action === "add"
            ? "참여자 추가"
            : memoModal.action === "exclude"
              ? "참여 제외"
              : "사전조사 수정"}{" "}
          — {memoModal.member.nickname}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">사유 또는 메모를 입력하세요.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <button key={preset} type="button" onClick={() => onMemoChange(preset)} className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
              {preset}
            </button>
          ))}
        </div>
        <textarea value={memoText} onChange={(e) => onMemoChange(e.target.value)} placeholder="메모..." rows={3} className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground">취소</button>
          <button type="button" onClick={onSubmit} disabled={!memoText.trim()} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">확인</button>
        </div>
      </div>
    </div>
  )
}

function ModifyModal({
  modifyModal,
  modifyReason,
  onReasonChange,
  onCancel,
  onSubmit,
}: {
  modifyModal: { name: string; field: string; current: boolean }
  modifyReason: string
  onReasonChange: (v: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-xl">
        <p className="text-sm font-semibold text-foreground">상태 수정 — {modifyModal.name}</p>
        <textarea value={modifyReason} onChange={(e) => onReasonChange(e.target.value)} placeholder="수정 사유..." rows={3} className="mt-3 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary" />
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-border bg-secondary py-2.5 text-sm font-medium text-muted-foreground">취소</button>
          <button type="button" onClick={onSubmit} disabled={!modifyReason.trim()} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">확인</button>
        </div>
      </div>
    </div>
  )
}
