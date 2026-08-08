"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import { useContributionSettings } from "@/components/contribution-settings-context"
import type { ContributionScoreSetting } from "@/lib/contribution-score-settings"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminContributionSettingsView({ onNavigate }: Props) {
  const { refreshSettings } = useContributionSettings()
  const [settings, setSettings] = useState<ContributionScoreSetting[]>([])
  const [general, setGeneral] = useState("1")
  const [main, setMain] = useState("1.5")
  const [siege, setSiege] = useState("2")
  const [effectiveFrom, setEffectiveFrom] = useState("")
  const [saving, setSaving] = useState(false)

  const loadSettings = useCallback(async () => {
    const res = await fetch("/api/admin/contribution-settings")
    const data = (await res.json()) as { ok: boolean; settings?: ContributionScoreSetting[] }
    if (data.ok) setSettings(data.settings ?? [])
  }, [])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  async function handleSave() {
    setSaving(true)
    const res = await fetch("/api/admin/contribution-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_setting",
        generalBossScore: Number(general),
        mainBossScore: Number(main),
        siegeScore: Number(siege),
        effectiveFrom,
      }),
    })
    const data = (await res.json()) as { ok: boolean; message: string }
    setSaving(false)
    alert(data.message)
    if (data.ok) {
      await loadSettings()
      await refreshSettings()
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리", onClick: () => onNavigate(initialDataNav()) },
          { label: "기여도 점수 설정" },
        ]}
      />

      <SectionTitle>기여도 점수 설정</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        점수 변경은 적용 시작일 이후 기록에만 반영됩니다. 과거 참여기록은 소급 변경되지 않습니다.
      </p>

      <Card className="mb-4 flex flex-col gap-3">
        <Field label="일반 보스타임" value={general} onChange={setGeneral} />
        <Field label="메인 보스타임" value={main} onChange={setMain} />
        <Field label="공성" value={siege} onChange={setSiege} />
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">적용 시작일</label>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </Card>

      <SectionTitle>설정 이력</SectionTitle>
      <div className="flex flex-col gap-2">
        {settings.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">설정 없음</Card>
        )}
        {[...settings].reverse().map((s) => (
          <Card key={s.id} className="py-3 text-xs">
            <p className="font-medium">{s.effectiveFrom}부터 적용</p>
            <p className="mt-1 text-muted-foreground">
              일반 {s.generalBossScore} · 메인 {s.mainBossScore} · 공성 {s.siegeScore}
            </p>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Field({
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
      />
    </div>
  )
}
