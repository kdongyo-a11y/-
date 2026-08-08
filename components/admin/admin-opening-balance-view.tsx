"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import { useGuildLedger } from "@/components/guild-ledger-context"
import { formatWon } from "@/lib/guild-data"
import type { GuildFinanceSettingLog } from "@/lib/supabase/admin-settings-data"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminOpeningBalanceView({ onNavigate }: Props) {
  const { guildFund, openingBalance, refreshFinance } = useGuildLedger()
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [logs, setLogs] = useState<GuildFinanceSettingLog[]>([])
  const [saving, setSaving] = useState(false)

  const loadLogs = useCallback(async () => {
    const res = await fetch("/api/admin/finance-settings")
    const data = (await res.json()) as {
      ok: boolean
      openingBalance?: number
      logs?: GuildFinanceSettingLog[]
    }
    if (data.ok) {
      setLogs(data.logs ?? [])
      if (data.openingBalance !== undefined) {
        setAmount(String(data.openingBalance))
      }
    }
  }, [])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  async function handleSave() {
    const parsed = Number(amount.replace(/,/g, ""))
    if (!Number.isFinite(parsed) || parsed < 0) {
      alert("금액을 올바르게 입력해주세요.")
      return
    }
    if (!reason.trim()) {
      alert("변경 사유를 입력해주세요.")
      return
    }

    setSaving(true)
    const res = await fetch("/api/admin/finance-settings/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_opening_balance",
        openingBalance: parsed,
        reason: reason.trim(),
      }),
    })
    const data = (await res.json()) as { ok: boolean; message: string }
    setSaving(false)
    alert(data.message)
    if (data.ok) {
      setReason("")
      await refreshFinance()
      await loadLogs()
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리", onClick: () => onNavigate(initialDataNav()) },
          { label: "기초 혈맹자금" },
        ]}
      />

      <SectionTitle>기초 혈맹자금</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        프로그램 사용 시작 이전부터 보유하고 있던 혈맹 자금을 입력합니다. 혈비·장부 기록은 생성하지
        않습니다.
      </p>

      <Card className="mb-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">현재 설정금액</span>
          <span className="font-semibold">{formatWon(openingBalance)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">현재 혈맹자금</span>
          <span className="font-semibold text-primary">{formatWon(guildFund)}</span>
        </div>
      </Card>

      <Card className="mb-4 flex flex-col gap-3">
        <label className="text-xs font-medium text-muted-foreground">기초 혈맹자금</label>
        <input
          type="text"
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="0"
        />
        <label className="text-xs font-medium text-muted-foreground">변경 사유</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          placeholder="운영 시작 전 기존 보유 자금"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </Card>

      <SectionTitle>변경 이력</SectionTitle>
      <div className="flex flex-col gap-2">
        {logs.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">변경 이력 없음</Card>
        )}
        {logs.map((log) => (
          <Card key={log.id} className="py-3 text-xs">
            <p className="font-medium">
              {formatWon(log.previousOpeningBalance)} → {formatWon(log.newOpeningBalance)}
            </p>
            <p className="mt-1 text-muted-foreground">{log.reason}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {new Date(log.createdAt).toLocaleString("ko-KR")}
            </p>
          </Card>
        ))}
      </div>
    </div>
  )
}
