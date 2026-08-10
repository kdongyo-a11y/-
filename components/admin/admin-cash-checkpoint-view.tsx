"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import { formatWon } from "@/lib/guild-data"
import type { GuildCashCheckpoint } from "@/lib/guild-cash-types"
import { createCashCheckpoint, fetchCashCheckpoints } from "@/lib/operations-api"
import { getTodayDateString } from "@/lib/boss-time-slots"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminCashCheckpointView({ onNavigate }: Props) {
  const today = getTodayDateString()
  const [amount, setAmount] = useState("")
  const [effectiveDate, setEffectiveDate] = useState(today)
  const [effectiveTime, setEffectiveTime] = useState("00:00")
  const [memo, setMemo] = useState("")
  const [checkpoints, setCheckpoints] = useState<GuildCashCheckpoint[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetchCashCheckpoints()
    if (res.ok && res.checkpoints) {
      setCheckpoints(res.checkpoints)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    const parsed = Number(amount.replace(/,/g, ""))
    if (!Number.isFinite(parsed)) {
      alert("금액을 올바르게 입력해주세요.")
      return
    }
    if (!memo.trim()) {
      alert("메모(사유)를 입력해주세요.")
      return
    }

    const effectiveAt = new Date(`${effectiveDate}T${effectiveTime}:00`).toISOString()
    setSaving(true)
    const res = await createCashCheckpoint({
      effectiveAt,
      openingCashBalance: parsed,
      memo: memo.trim(),
    })
    setSaving(false)
    alert(res.message)
    if (res.ok) {
      setMemo("")
      await load()
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리", onClick: () => onNavigate(initialDataNav()) },
          { label: "실보유액 기준점" },
        ]}
      />
      <SectionTitle>Finance 2.0 실보유액 기준점</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        go-live 시점의 실제 혈맹 금고 잔액을 baseline으로 설정합니다. 기존 기초 혈맹자금(opening_balance)과
        별개이며, 이후 cash movement만 합산합니다. 재기준 시 새 checkpoint를 추가합니다.
      </p>

      <Card className="mb-4 space-y-3 p-4">
        <label className="block text-xs">
          <span className="text-muted-foreground">기준 시점 (effective_at)</span>
          <div className="mt-1 flex gap-2">
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="time"
              value={effectiveTime}
              onChange={(e) => setEffectiveTime(e.target.value)}
              className="w-28 rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">기준 실보유액 (원)</span>
          <input
            type="text"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="5000000"
          />
        </label>
        <label className="block text-xs">
          <span className="text-muted-foreground">메모 / 사유</span>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            rows={2}
          />
        </label>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "저장 중…" : "기준점 저장"}
        </button>
      </Card>

      <SectionTitle>기준점 이력</SectionTitle>
      <div className="flex flex-col gap-2">
        {checkpoints.length === 0 && (
          <Card className="py-4 text-center text-xs text-muted-foreground">등록된 기준점이 없습니다.</Card>
        )}
        {checkpoints.map((cp) => (
          <Card key={cp.id} className="px-4 py-3">
            <p className="text-sm font-medium">{formatWon(cp.openingCashBalance)}원</p>
            <p className="text-[11px] text-muted-foreground">
              {new Date(cp.effectiveAt).toLocaleString("ko-KR")}
            </p>
            {cp.memo && <p className="mt-1 text-xs text-muted-foreground">{cp.memo}</p>}
          </Card>
        ))}
      </div>
    </div>
  )
}
