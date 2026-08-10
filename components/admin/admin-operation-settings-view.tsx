"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import type {
  ActiveMemberOption,
  GuildOperationSettingLog,
  GuildOperationSettings,
  PolicyAmountMode,
} from "@/lib/operation-settings-types"
import {
  POLICY_AMOUNT_MODE_LABELS,
  RATIO_BP_TOTAL,
  RESERVE_MODE_LABELS,
} from "@/lib/operation-settings-types"
import { MEMBER_ROLE_LABELS } from "@/lib/member-types"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

type AllocationDraft = {
  memberId: string
  nickname: string
  ratioBp: string
}

export function AdminOperationSettingsView({ onNavigate }: Props) {
  const [settings, setSettings] = useState<GuildOperationSettings | null>(null)
  const [activeMembers, setActiveMembers] = useState<ActiveMemberOption[]>([])
  const [logs, setLogs] = useState<GuildOperationSettingLog[]>([])
  const [managementFeeMode, setManagementFeeMode] = useState<PolicyAmountMode>("none")
  const [managementFeePercentage, setManagementFeePercentage] = useState("")
  const [reserveMode, setReserveMode] = useState<PolicyAmountMode>("manual_per_settlement")
  const [reservePercentage, setReservePercentage] = useState("")
  const [allocations, setAllocations] = useState<AllocationDraft[]>([])
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/operation-settings?logs=1")
    const data = (await res.json()) as {
      ok: boolean
      settings?: GuildOperationSettings
      activeMembers?: ActiveMemberOption[]
      logs?: GuildOperationSettingLog[]
      message?: string
    }
    if (!data.ok || !data.settings) {
      alert(data.message ?? "운영 정책을 불러오지 못했습니다.")
      return
    }
    setSettings(data.settings)
    setActiveMembers(data.activeMembers ?? [])
    setLogs(data.logs ?? [])
    setManagementFeeMode(data.settings.managementFeeMode)
    setManagementFeePercentage(
      data.settings.managementFeePercentage != null
        ? String(data.settings.managementFeePercentage)
        : "",
    )
    setReserveMode(data.settings.reserveMode)
    setReservePercentage(
      data.settings.reservePercentage != null ? String(data.settings.reservePercentage) : "",
    )
    setAllocations(
      data.settings.allocations.map((a) => ({
        memberId: a.memberId,
        nickname: a.nickname,
        ratioBp: String(a.ratioBp),
      })),
    )
  }, [])

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
    if (!reason.trim()) {
      alert("변경 사유를 입력해주세요.")
      return
    }

    setSaving(true)
    const res = await fetch("/api/admin/operation-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_settings",
        managementFeeMode,
        managementFeePercentage:
          managementFeeMode === "percentage" ? Number(managementFeePercentage) : null,
        reserveMode,
        reservePercentage: reserveMode === "percentage" ? Number(reservePercentage) : null,
        allocations: allocations.map((a) => ({
          memberId: a.memberId,
          ratioBp: parseInt(a.ratioBp, 10) || 0,
        })),
        reason: reason.trim(),
      }),
    })
    const data = (await res.json()) as { ok: boolean; message: string }
    setSaving(false)
    alert(data.message)
    if (data.ok) {
      setReason("")
      await load()
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
        설정 변경은 이후 신규 정산부터 즉시 적용됩니다. 기존 정산은 생성 시점 snapshot이
        유지됩니다. 관리비 수령 대상 지정은 role/permission을 변경하지 않습니다.
      </p>

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
        <label className="text-xs font-medium text-muted-foreground">변경 사유</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="예: 관리비 10% 및 배분 비율 조정"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
        {settings?.updatedAt && (
          <p className="text-[10px] text-muted-foreground">
            마지막 저장: {new Date(settings.updatedAt).toLocaleString("ko-KR")}
          </p>
        )}
      </Card>

      <SectionTitle>변경 이력</SectionTitle>
      <div className="flex flex-col gap-2">
        {logs.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">변경 이력 없음</Card>
        )}
        {logs.map((log) => (
          <Card key={log.id} className="py-3 text-xs">
            <p className="font-medium">{log.reason}</p>
            <p className="mt-1 text-muted-foreground">
              {new Date(log.createdAt).toLocaleString("ko-KR")}
            </p>
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
