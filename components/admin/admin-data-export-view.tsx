"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { AdminPeriodSelector } from "@/components/admin/admin-period-selector"
import type { AdminNavState } from "@/components/admin/admin-types"
import { dataManagementNav } from "@/components/admin/admin-nav-helpers"
import {
  EXPORT_DATASETS,
  EXPORT_DATASET_LABELS,
  type ExportDataset,
} from "@/lib/admin-data/export-types"
import type { PeriodType } from "@/lib/admin-data/period-utils"
import type { GuildExportLogRow } from "@/lib/supabase/export-log-data"
import { useTenant } from "@/components/tenant-context"
import { getTodayDateString } from "@/lib/boss-time-slots"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

type ExportStatus = "idle" | "exporting" | "done" | "error"

export function AdminDataExportView({ onNavigate }: Props) {
  const { guildName, serverName } = useTenant()
  const [period, setPeriod] = useState<PeriodType>("this_month")
  const [dateFrom, setDateFrom] = useState(getTodayDateString().slice(0, 8) + "01")
  const [dateTo, setDateTo] = useState(getTodayDateString())
  const [selected, setSelected] = useState<Set<ExportDataset>>(new Set(EXPORT_DATASETS))
  const [status, setStatus] = useState<ExportStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [logs, setLogs] = useState<GuildExportLogRow[]>([])
  const [logsLoading, setLogsLoading] = useState(true)

  const allSelected = selected.size === EXPORT_DATASETS.length

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const res = await fetch("/api/admin/export/history")
      const json = await res.json()
      if (res.ok && json.ok) setLogs(json.logs ?? [])
    } finally {
      setLogsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadLogs()
  }, [loadLogs])

  function toggleDataset(key: ExportDataset) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(EXPORT_DATASETS))
  }

  async function handleExport() {
    if (selected.size === 0) {
      setError("내보낼 데이터 종류를 선택해주세요.")
      return
    }

    setStatus("exporting")
    setError(null)

    try {
      const res = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          dateFrom: period === "custom" ? dateFrom : undefined,
          dateTo: period === "custom" ? dateTo : undefined,
          datasets: [...selected],
          format: "xlsx",
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.message ?? "내보내기에 실패했습니다.")
      }

      const blob = await res.blob()
      const disposition = res.headers.get("Content-Disposition") ?? ""
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
      const filename = match ? decodeURIComponent(match[1]) : "export.xlsx"

      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      setStatus("done")
      void loadLogs()
    } catch (e) {
      setStatus("error")
      setError(e instanceof Error ? e.message : "내보내기에 실패했습니다.")
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "데이터 관리", onClick: () => onNavigate(dataManagementNav()) },
          { label: "데이터 내보내기" },
        ]}
      />
      <SectionTitle>데이터 내보내기</SectionTitle>

      <Card className="mb-4 p-4">
        <p className="text-xs text-muted-foreground">현재 혈맹</p>
        <p className="text-sm font-semibold">{guildName ?? "—"}</p>
        <p className="mt-1 text-xs text-muted-foreground">{serverName ? `${serverName} 서버` : ""}</p>
      </Card>

      <AdminPeriodSelector
        period={period}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onPeriodChange={setPeriod}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <div className="mb-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">데이터 종류</p>
        <label className="mb-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} />
          전체 선택
        </label>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_DATASETS.map((key) => (
            <label key={key} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={selected.has(key)}
                onChange={() => toggleDataset(key)}
              />
              {EXPORT_DATASET_LABELS[key]}
            </label>
          ))}
        </div>
      </div>

      <p className="mb-3 text-xs text-muted-foreground">형식: XLSX</p>

      <button
        type="button"
        disabled={status === "exporting"}
        onClick={() => void handleExport()}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {status === "exporting" ? "파일 생성 중..." : "내보내기"}
      </button>

      {status === "done" && (
        <p className="mt-2 text-xs text-primary">완료 → 다운로드되었습니다.</p>
      )}
      {(status === "error" || error) && (
        <p className="mt-2 text-xs text-destructive">{error ?? "내보내기에 실패했습니다."}</p>
      )}

      <Card className="mt-6 p-4">
        <p className="mb-2 text-sm font-semibold">내보내기 이력</p>
        {logsLoading && <p className="text-xs text-muted-foreground">불러오는 중...</p>}
        {!logsLoading && logs.length === 0 && (
          <p className="text-xs text-muted-foreground">이력 없음</p>
        )}
        {!logsLoading && logs.length > 0 && (
          <ul className="space-y-2">
            {logs.map((log) => (
              <li key={log.id} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {String(log.created_at).slice(0, 16).replace("T", " ")}
                </span>
                {" · "}
                {log.period_type} ({log.date_from} ~ {log.date_to})
                {" · "}
                {log.status === "success" ? "성공" : "실패"}
                {" · "}
                {(log.datasets as string[]).length}종
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
