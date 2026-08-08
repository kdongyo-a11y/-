"use client"

import { useCallback, useEffect, useState } from "react"
import { ClanMark } from "@/components/clan-mark"
import { Card, SectionTitle } from "@/components/ui-bits"
import { cn } from "@/lib/utils"
import { useGuildProfile } from "@/components/guild-profile-context"
import { useTenant } from "@/components/tenant-context"
import {
  DEFAULT_CONTRIBUTION_SCORES,
  isValidContributionScore,
} from "@/lib/contribution-score-settings"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITIONS,
  type MemberCharacterClass,
  type MemberPosition,
} from "@/lib/member-types"

type Props = {
  onComplete: () => void
}

type Step = 1 | 2 | 3 | 4 | 5

type MemberDraft = {
  nickname: string
  characterClass: MemberCharacterClass
  level: string
  position: MemberPosition
}

const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "기본정보" },
  { id: 2, label: "혈맹자금" },
  { id: 3, label: "기여도" },
  { id: 4, label: "혈맹원" },
  { id: 5, label: "완료" },
]

export function OnboardingWizardScreen({ onComplete }: Props) {
  const { profile, refreshProfile, applyProfile } = useGuildProfile()
  const { guildName, serverName } = useTenant()

  const [step, setStep] = useState<Step>(1)
  const [markFile, setMarkFile] = useState<File | null>(null)
  const [openingBalance, setOpeningBalance] = useState("0")
  const [general, setGeneral] = useState(String(DEFAULT_CONTRIBUTION_SCORES.generalBossScore))
  const [main, setMain] = useState(String(DEFAULT_CONTRIBUTION_SCORES.mainBossScore))
  const [siege, setSiege] = useState(String(DEFAULT_CONTRIBUTION_SCORES.siegeScore))
  const [memberRows, setMemberRows] = useState<MemberDraft[]>([
    { nickname: "", characterClass: "기사", level: "1", position: "일반" },
  ])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  const today = new Date().toISOString().slice(0, 10)

  const saveStep1 = useCallback(async () => {
    if (markFile) {
      const formData = new FormData()
      formData.set("file", markFile)
      const res = await fetch("/api/admin/guild-profile/mark", {
        method: "POST",
        body: formData,
      })
      const data = (await res.json()) as {
        ok: boolean
        message?: string
        profile?: { guildMarkUrl?: string; guildMarkPath?: string | null }
      }
      if (!data.ok) {
        setError(data.message ?? "혈맹마크 업로드에 실패했습니다.")
        return false
      }
      applyProfile({
        guildMarkUrl: data.profile?.guildMarkUrl,
        guildMarkPath: data.profile?.guildMarkPath ?? null,
      })
    }

    await refreshProfile()
    return true
  }, [markFile, applyProfile, refreshProfile])

  const saveStep2 = useCallback(async (skip: boolean) => {
    if (skip) return true
    const balance = Number(openingBalance)
    if (!Number.isFinite(balance) || balance < 0) {
      setError("기초 혈맹자금은 0 이상이어야 합니다.")
      return false
    }
    if (balance === 0) return true

    const res = await fetch("/api/admin/finance-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_opening_balance",
        openingBalance: balance,
        reason: "온보딩 초기 설정",
      }),
    })
    const data = (await res.json()) as { ok: boolean; message?: string }
    if (!data.ok) {
      setError(data.message ?? "기초 혈맹자금 저장에 실패했습니다.")
      return false
    }
    return true
  }, [openingBalance])

  const saveStep3 = useCallback(async (useDefaults: boolean) => {
    if (useDefaults) return true

    const g = Number(general)
    const m = Number(main)
    const s = Number(siege)
    if (
      !isValidContributionScore(g) ||
      !isValidContributionScore(m) ||
      !isValidContributionScore(s)
    ) {
      setError("점수는 0 이상 100 이하 숫자여야 합니다.")
      return false
    }

    const sameAsDefault =
      g === DEFAULT_CONTRIBUTION_SCORES.generalBossScore &&
      m === DEFAULT_CONTRIBUTION_SCORES.mainBossScore &&
      s === DEFAULT_CONTRIBUTION_SCORES.siegeScore

    if (sameAsDefault) return true

    const res = await fetch("/api/admin/contribution-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_setting",
        generalBossScore: g,
        mainBossScore: m,
        siegeScore: s,
        effectiveFrom: today,
      }),
    })
    const data = (await res.json()) as { ok: boolean; message?: string }
    if (!data.ok) {
      setError(data.message ?? "기여도 설정 저장에 실패했습니다.")
      return false
    }
    return true
  }, [general, main, siege, today])

  const saveStep4 = useCallback(async (skip: boolean) => {
    if (skip) return true

    const rows = memberRows.filter((r) => r.nickname.trim())
    if (rows.length === 0) return true

    const res = await fetch("/api/members/bulk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        members: rows.map((r) => ({
          nickname: r.nickname.trim(),
          characterClass: r.characterClass,
          level: Number(r.level),
          position: r.position,
        })),
      }),
    })
    const data = (await res.json()) as { ok: boolean; message?: string }
    if (!data.ok) {
      setError(data.message ?? "혈맹원 등록에 실패했습니다.")
      return false
    }
    return true
  }, [memberRows])

  async function handleNext(options?: { skip?: boolean; useDefaults?: boolean }) {
    setError(null)
    setBusy(true)
    try {
      let ok = true
      if (step === 1) ok = await saveStep1()
      if (step === 2) ok = await saveStep2(options?.skip ?? false)
      if (step === 3) ok = await saveStep3(options?.useDefaults ?? false)
      if (step === 4) ok = await saveStep4(options?.skip ?? false)
      if (step === 5) {
        const res = await fetch("/api/onboarding/complete", { method: "POST" })
        const data = (await res.json()) as { ok: boolean; message?: string }
        if (!data.ok) {
          setError(data.message ?? "완료 처리에 실패했습니다.")
          return
        }
        onComplete()
        return
      }
      if (ok) setStep((s) => Math.min(5, s + 1) as Step)
    } finally {
      setBusy(false)
    }
  }

  function addMemberRow() {
    setMemberRows((rows) => [
      ...rows,
      { nickname: "", characterClass: "기사", level: "1", position: "일반" },
    ])
  }

  function updateMemberRow(index: number, patch: Partial<MemberDraft>) {
    setMemberRows((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeMemberRow(index: number) {
    setMemberRows((rows) => rows.filter((_, i) => i !== index))
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background px-4 pb-8">
      <div className="py-6 text-center">
        <ClanMark size="sm" className="mx-auto mb-3" />
        <h1 className="text-lg font-semibold text-foreground">최초 설정</h1>
        <p className="mt-1 text-xs text-muted-foreground">혈맹 운영을 위한 기본 설정을 진행합니다.</p>
      </div>

      <div className="mb-6 flex gap-1">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={cn(
              "h-1 flex-1 rounded-full",
              step >= s.id ? "bg-primary" : "bg-muted",
            )}
            title={s.label}
          />
        ))}
      </div>

      {step === 1 && (
        <>
          <SectionTitle>혈맹 확인</SectionTitle>
          <Card className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">서버</label>
              <input
                readOnly
                value={serverName ?? profile?.serverName ?? ""}
                className="w-full rounded-xl border border-border bg-muted px-3 py-3 text-sm text-muted-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">혈맹명</label>
              <input
                readOnly
                value={guildName ?? profile?.guildName ?? ""}
                className="w-full rounded-xl border border-border bg-muted px-3 py-3 text-sm text-muted-foreground"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                혈맹마크 (선택)
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setMarkFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs"
              />
            </div>
          </Card>
        </>
      )}

      {step === 2 && (
        <>
          <SectionTitle>기초 혈맹자금</SectionTitle>
          <Card>
            <Field
              label="기초 혈맹자금 (원)"
              value={openingBalance}
              onChange={setOpeningBalance}
              type="number"
            />
            <p className="mt-2 text-xs text-muted-foreground">기본값 0원입니다. 나중에 관리자 메뉴에서 변경할 수 있습니다.</p>
          </Card>
        </>
      )}

      {step === 3 && (
        <>
          <SectionTitle>기여도 점수</SectionTitle>
          <Card className="flex flex-col gap-3">
            <Field label="일반 보스타임" value={general} onChange={setGeneral} />
            <Field label="메인 보스타임" value={main} onChange={setMain} />
            <Field label="공성" value={siege} onChange={setSiege} />
            <p className="text-xs text-muted-foreground">
              기본값(1 / 1.5 / 2)을 그대로 사용하거나 변경할 수 있습니다. 변경 시 오늘({today})부터 적용됩니다.
            </p>
          </Card>
        </>
      )}

      {step === 4 && (
        <>
          <SectionTitle>혈맹원 등록</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">1명씩 또는 여러 명을 등록할 수 있습니다. 나중에도 추가할 수 있습니다.</p>
          <div className="flex flex-col gap-3">
            {memberRows.map((row, index) => (
              <Card key={index} className="flex flex-col gap-2">
                <Field label="캐릭터명" value={row.nickname} onChange={(v) => updateMemberRow(index, { nickname: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <SelectField
                    label="클래스"
                    value={row.characterClass}
                    options={MEMBER_CHARACTER_CLASSES}
                    onChange={(v) => updateMemberRow(index, { characterClass: v as MemberCharacterClass })}
                  />
                  <SelectField
                    label="직책"
                    value={row.position}
                    options={MEMBER_POSITIONS}
                    onChange={(v) => updateMemberRow(index, { position: v as MemberPosition })}
                  />
                </div>
                <Field label="레벨" value={row.level} onChange={(v) => updateMemberRow(index, { level: v })} type="number" />
                {memberRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMemberRow(index)}
                    className="text-xs text-destructive"
                  >
                    삭제
                  </button>
                )}
              </Card>
            ))}
            <button
              type="button"
              onClick={addMemberRow}
              className="rounded-xl border border-dashed border-border py-2 text-xs text-muted-foreground"
            >
              + 혈맹원 추가
            </button>
          </div>
        </>
      )}

      {step === 5 && (
        <>
          <SectionTitle>설정 완료</SectionTitle>
          <Card>
            <p className="text-sm text-foreground">모든 준비가 끝났습니다.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              완료 후 관리자 홈으로 이동하며, 각 설정은 관리자 메뉴에서 언제든 수정할 수 있습니다.
            </p>
          </Card>
        </>
      )}

      {error && (
        <p className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {step === 2 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNext({ skip: true })}
            className="rounded-xl border border-border py-3 text-sm text-muted-foreground"
          >
            건너뛰기
          </button>
        )}
        {step === 3 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNext({ useDefaults: true })}
            className="rounded-xl border border-border py-3 text-sm text-muted-foreground"
          >
            기본값 사용
          </button>
        )}
        {step === 4 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleNext({ skip: true })}
            className="rounded-xl border border-border py-3 text-sm text-muted-foreground"
          >
            나중에 하기
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleNext()}
          className={cn(
            "rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground",
            busy && "opacity-70",
          )}
        >
          {busy ? "처리 중…" : step === 5 ? "관리자 홈으로" : "다음"}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-foreground"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}
