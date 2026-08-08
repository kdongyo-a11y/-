import {
  getAllTimePeriod,
  getLastMonthPeriod,
  getThisMonthPeriod,
  getTodayDateString,
  type ContributionPeriod,
} from "@/lib/contribution-utils"

export type PeriodType = "all" | "this_month" | "last_month" | "this_year" | "custom"

export type ResolvedPeriod = ContributionPeriod & {
  type: PeriodType
}

export function getThisYearPeriod(refDate = getTodayDateString()): ContributionPeriod {
  const y = refDate.slice(0, 4)
  return {
    start: `${y}-01-01`,
    end: refDate,
    label: `${y}년`,
  }
}

export function resolveAdminPeriod(
  period: PeriodType,
  dateFrom?: string,
  dateTo?: string,
): ResolvedPeriod {
  if (period === "this_month") {
    return { ...getThisMonthPeriod(), type: period }
  }
  if (period === "last_month") {
    return { ...getLastMonthPeriod(), type: period }
  }
  if (period === "this_year") {
    return { ...getThisYearPeriod(), type: period }
  }
  if (period === "custom") {
    const start = dateFrom?.trim() ?? ""
    const end = dateTo?.trim() ?? ""
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
      throw new Error("유효한 조회 기간을 선택해주세요.")
    }
    return { start, end, label: `${start} ~ ${end}`, type: period }
  }
  return { ...getAllTimePeriod(), type: "all" }
}

export function isDateInRange(date: string, period: ContributionPeriod): boolean {
  return date >= period.start && date <= period.end
}

export const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "this_month", label: "이번 달" },
  { value: "last_month", label: "지난 달" },
  { value: "this_year", label: "올해" },
  { value: "all", label: "전체" },
  { value: "custom", label: "직접 선택" },
]
