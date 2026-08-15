"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import type {
  ActiveMemberOption,
  GuildOperationPolicyView,
  PolicyAmountMode,
  PolicyVersionStatus,
} from "@/lib/operation-settings-types"
import {
  POLICY_AMOUNT_MODE_LABELS,
  RATIO_BP_TOTAL,
  RESERVE_MODE_LABELS,
} from "@/lib/operation-settings-types"
import { MEMBER_ROLE_LABELS } from "@/lib/member-types"
import { formatKstDateTimeLabel } from "@/lib/operation-policy-kst-utils"
import { trackInteraction } from "@/lib/interaction-perf"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

type AllocationDraft = {
  memberId: string
  nickname: string
  ratioBp: string
}

const POLICY_STATUS_LABELS: Record<PolicyVersionStatus, string> = {
  current: "현재 적용",
  scheduled: "예약",
  past: "과거",
  cancelled: "취소됨",
}

function policyFinanceLabel(view: GuildOperationPolicyView["currentPolicy"]): string {
  if (!view) return "정책 없음"
  const f = view.policySnapshot.finance
  const mgmt =
    f.managementFeeMode === "percentage"
      ? `관리비 ${f.managementFeePercentage}%`
      : POLICY_AMOUNT_MODE_LABELS[f.managementFeeMode]
  const reserve =
    f.reserveMode === "percentage"
      ? `비축 ${f.reservePercentage}%`
      : RESERVE_MODE_LABELS[f.reserveMode]
  return `${mgmt} · ${reserve}`
}

export function AdminOperationSettingsView({ onNavigate }: Props) {
  const [policyView, setPolicyView] = useState<GuildOperationPolicyView | null>(null)
  const [activeMembers, setActiveMembers] = useState<ActiveMemberOption[]>([])
  const [managementFeeMode, setManagementFeeMode] = useState<PolicyAmountMode>("none")
  const [managementFeePercentage, setManagementFeePercentage] = useState("")
  const [reserveMode, setReserveMode] = useState<PolicyAmountMode>("manual_per_settlement")
  const [reservePercentage, setReservePercentage] = useState("")
  const [allocations, setAllocations] = useState<AllocationDraft[]>([])
  const [changeReason, setChangeReason] = useState("")
  const [effectiveFromMode, setEffectiveFromMode] = useState<"now" | "scheduled">("now")
  const [effectiveFromDate, setEffectiveFromDate] = useState("")
  const [effectiveFromTime, setEffectiveFromTime] = useState("00:00")
  const [saving, setSaving] = useState(false)

  const applyPolicyView = useCallback((view: GuildOperationPolicyView) => {
    setPolicyView(view)
    const s = view.settings
    setManagementFeeMode(s.managementFeeMode)
    setManagementFeePercentage(
      s.managementFeePercentage != null ? String(s.managementFeePercentage) : "",
    )
    setReserveMode(s.reserveMode)
    setReservePercentage(s.reservePercentage != null ? String(s.reservePercentage) : "")
    setAllocations(
      s.allocations.map((a) => ({
        memberId: a.memberId,
        nickname: a.nickname,
        ratioBp: String(a.ratioBp),
      })),
    )
  }, [])

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/operation-settings")
    const data = (await res.json()) as {
      ok: boolean
      policyView?: GuildOperationPolicyView
      activeMembers?: ActiveMemberOption[]
      message?: string
    }
    if (!data.ok || !data.policyView) {
      alert(data.message ?? "운영 정책을 불러오지 못했습니다.")
      return
    }
    applyPolicyView(data.policyView)
    setActiveMembers(data.activeMembers ?? [])
  }, [applyPolicyView])

  useEffect(() => {
    void load()
  }, [load])

  const ratioSum = useMemo(
    () => allocations.reduce((sum, a) => sum + (parseInt(a.ratioBp, 10) || 0), 0),
    [allocations],
  )

  const selectedIds = useMemo(() => new Set(allocations.map((a) => a.memberId)), [allocations])

  function addMember(member: ActiveMemberOption) {
    if (selectedIds.has(member.id)) return
    setAllocations((prev) => [
      ...prev,
      { memberId: member.id, nickname: member.nickname, ratioBp: "" },
    ])
  }

  function removeMember(memberId: string) {
    setAllocations((prev) => prev.filter((a) => a.memberId !== memberId))
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const tracker = trackInteraction("operation-policy-save")
    tracker.markPending()
    const res = await fetch("/api/admin/operation-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_version",
        managementFeeMode,
        managementFeePercentage:
          managementFeeMode === "percentage" ? Number(managementFeePercentage) : null,
        reserveMode,
        reservePercentage: reserveMode === "percentage" ? Number(reservePercentage) : null,
        allocations: allocations.map((a) => ({
          memberId: a.memberId,
          ratioBp: parseInt(a.ratioBp, 10) || 0,
        })),
        changeReason,
        effectiveFromMode,
        effectiveFromDate: effectiveFromMode === "scheduled" ? effectiveFromDate : undefined,
        effectiveFromTime: effectiveFromMode === "scheduled" ? effectiveFromTime : undefined,
      }),
    })
    const data = (await res.json()) as {
      ok: boolean
      message: string
      policyView?: GuildOperationPolicyView
    }
    setSaving(false)
    tracker.finish({ ok: data.ok })
    alert(data.message)
    if (data.ok) {
      setChangeReason("")
      if (data.policyView) {
        applyPolicyView(data.policyView)
      } else {
        await load()
      }
    }
  }

  async function handleCancelScheduled(versionId: string) {
    const cancelReason = window.prompt("예약 정책 취소 사유를 입력하세요.")
    if (!cancelReason?.trim()) return
    const res = await fetch("/api/admin/operation-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cancel_scheduled_version",
        versionId,
        cancelReason: cancelReason.trim(),
      }),
    })
    const data = (await res.json()) as {
      ok: boolean
      message: string
      policyView?: GuildOperationPolicyView
    }
    alert(data.message)
    if (data.ok) {
      if (data.policyView) {
        applyPolicyView(data.policyView)
      } else {
        await load()
      }
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리", onClick: () => onNavigate(initialDataNav()) },
          { label: "운영 정책" },
        ]}
      />

      <SectionTitle>운영 정책</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        정책은 event occurred_at 기준으로 적용됩니다. 저장 시각(created_at)과 시행
        시각(effective_from)은 별개이며, 과거 시행 시각으로의 소급 등록은 불가합니다.
      </p>

      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <Card className="space-y-1 p-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">현재 적용 정책</p>
          {policyView?.currentPolicy ? (
            <>
              <p className="font-semibold">{policyFinanceLabel(policyView.currentPolicy)}</p>
              <p className="text-xs text-muted-foreground">
                v{policyView.currentPolicy.version} · 시행{" "}
                {formatKstDateTimeLabel(policyView.currentPolicy.effectiveFrom)}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">없음</p>
          )}
        </Card>
        <Card className="space-y-2 p-4 text-sm">
          <p className="text-xs font-medium text-muted-foreground">예약 정책</p>
          {(policyView?.scheduledPolicies ?? []).length === 0 ? (
            <p className="text-muted-foreground">없음</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(policyView?.scheduledPolicies ?? []).map((sp) => (
                <div key={sp.id} className="rounded-lg border border-border/60 p-2">
                  <p className="font-semibold">{policyFinanceLabel(sp)}</p>
                  <p className="text-xs text-muted-foreground">
                    v{sp.version} · 시행 {formatKstDateTimeLabel(sp.effectiveFrom)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCancelScheduled(sp.id)}
                    className="mt-1 text-xs text-destructive"
                  >
                    예약 취소
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="mb-4 flex flex-col gap-4">
        <ModeField
          label="관리비 산정 방식"
          value={managementFeeMode}
          onChange={setManagementFeeMode}
          labels={POLICY_AMOUNT_MODE_LABELS}
        />
        {managementFeeMode === "percentage" && (
          <PercentField
            label="관리비 비율 (%)"
            value={managementFeePercentage}
            onChange={setManagementFeePercentage}
          />
        )}
        <ModeField
          label="혈맹자금 비축 방식"
          value={reserveMode}
          onChange={setReserveMode}
          labels={RESERVE_MODE_LABELS}
        />
        {reserveMode === "percentage" && (
          <PercentField
            label="혈맹 비축 비율 (%)"
            value={reservePercentage}
            onChange={setReservePercentage}
          />
        )}
      </Card>

      {managementFeeMode !== "none" && (
        <Card className="mb-4 flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold">관리자별 관리비 배분</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              활동 상태 혈맹원 중 직접 선택 · 합계 {RATIO_BP_TOTAL}bp (100%) 필수
            </p>
            <p
              className={`mt-1 text-xs font-medium ${ratioSum === RATIO_BP_TOTAL ? "text-primary" : "text-destructive"}`}
            >
              현재 합계: {ratioSum}bp
            </p>
          </div>
          {allocations.map((a) => (
            <div key={a.memberId} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{a.nickname}</span>
              <input
                type="text"
                inputMode="numeric"
                value={a.ratioBp}
                onChange={(e) =>
                  setAllocations((prev) =>
                    prev.map((row) =>
                      row.memberId === a.memberId
                        ? { ...row, ratioBp: e.target.value.replace(/\D/g, "") }
                        : row,
                    ),
                  )
                }
                className="w-24 rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                placeholder="bp"
              />
              <span className="text-xs text-muted-foreground">bp</span>
              <button
                type="button"
                onClick={() => removeMember(a.memberId)}
                className="text-xs text-destructive"
              >
                제거
              </button>
            </div>
          ))}
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">수령 대상 추가</p>
            <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
              {activeMembers
                .filter((m) => !selectedIds.has(m.id))
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => addMember(m)}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent"
                  >
                    <span>{m.nickname}</span>
                    <span className="text-muted-foreground">
                      {MEMBER_ROLE_LABELS[m.role as keyof typeof MEMBER_ROLE_LABELS] ?? m.role} ·{" "}
                      {m.position}
                    </span>
                  </button>
                ))}
            </div>
          </div>
        </Card>
      )}

      <Card className="mb-4 flex flex-col gap-3">
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">시행 시각 (KST)</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={effectiveFromMode === "now"}
                onChange={() => setEffectiveFromMode("now")}
              />
              지금부터 적용
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={effectiveFromMode === "scheduled"}
                onChange={() => setEffectiveFromMode("scheduled")}
              />
              지정한 날짜/시간부터 적용
            </label>
          </div>
          {effectiveFromMode === "scheduled" && (
            <div className="mt-3 flex gap-2">
              <input
                type="date"
                value={effectiveFromDate}
                onChange={(e) => setEffectiveFromDate(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={effectiveFromTime}
                onChange={(e) => setEffectiveFromTime(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
        <label className="text-xs font-medium text-muted-foreground">변경 사유</label>
        <input
          type="text"
          value={changeReason}
          onChange={(e) => setChangeReason(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="예: 9/1부터 관리비 7%로 변경"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "저장 중..." : "정책 version 등록"}
        </button>
      </Card>

      <SectionTitle>정책 version 이력</SectionTitle>
      <div className="flex flex-col gap-2">
        {(policyView?.versions ?? []).length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">이력 없음</Card>
        )}
        {(policyView?.versions ?? []).map((v) => (
          <Card key={v.id} className="py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">
                v{v.version} · {policyFinanceLabel(v)}
              </p>
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {POLICY_STATUS_LABELS[v.status]}
              </span>
            </div>
            <p className="mt-1 text-muted-foreground">{v.changeReason}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              시행 {formatKstDateTimeLabel(v.effectiveFrom)} · 등록{" "}
              {formatKstDateTimeLabel(v.createdAt)}
            </p>
            {v.status === "scheduled" && (
              <button
                type="button"
                onClick={() => void handleCancelScheduled(v.id)}
                className="mt-2 text-xs text-destructive"
              >
                예약 취소
              </button>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

function ModeField({
  label,
  value,
  onChange,
  labels,
}: {
  label: string
  value: PolicyAmountMode
  onChange: (v: PolicyAmountMode) => void
  labels: Record<PolicyAmountMode, string>
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PolicyAmountMode)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      >
        {(Object.keys(labels) as PolicyAmountMode[]).map((mode) => (
          <option key={mode} value={mode}>
            {labels[mode]}
          </option>
        ))}
      </select>
    </div>
  )
}

function PercentField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        placeholder="0"
      />
    </div>
  )
}
