"use client"

import type { PeriodType } from "@/lib/admin-data/period-utils"
import { PERIOD_OPTIONS } from "@/lib/admin-data/period-utils"

type Props = {
  period: PeriodType
  dateFrom: string
  dateTo: string
  onPeriodChange: (period: PeriodType) => void
  onDateFromChange: (value: string) => void
  onDateToChange: (value: string) => void
}

export function AdminPeriodSelector({
  period,
  dateFrom,
  dateTo,
  onPeriodChange,
  onDateFromChange,
  onDateToChange,
}: Props) {
  return (
    <div className="mb-4 space-y-2">
      <label className="block text-xs font-medium text-muted-foreground">조회 기간</label>
      <select
        value={period}
        onChange={(e) => onPeriodChange(e.target.value as PeriodType)}
        className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm"
      >
        {PERIOD_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {period === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          />
        </div>
      )}
    </div>
  )
}
