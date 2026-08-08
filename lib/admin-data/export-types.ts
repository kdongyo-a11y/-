export const EXPORT_DATASETS = [
  "members",
  "boss_slots",
  "boss_participations",
  "siege",
  "siege_participations",
  "settlements",
  "settlement_members",
  "dues",
  "expenses",
  "ledger",
  "contribution",
  "contribution_detail",
] as const

export type ExportDataset = (typeof EXPORT_DATASETS)[number]

export const EXPORT_DATASET_LABELS: Record<ExportDataset, string> = {
  members: "혈맹원",
  boss_slots: "보스타임",
  boss_participations: "보스참여",
  siege: "공성",
  siege_participations: "공성참여",
  settlements: "정산",
  settlement_members: "개인분배",
  dues: "혈비",
  expenses: "지출",
  ledger: "장부",
  contribution: "기여도",
  contribution_detail: "기여도상세",
}

export const EXPORT_SHEET_NAMES: Record<ExportDataset, string> = {
  members: "01_혈맹원",
  boss_slots: "02_보스타임",
  boss_participations: "03_보스참여",
  siege: "04_공성",
  siege_participations: "05_공성참여",
  settlements: "06_정산",
  settlement_members: "07_개인분배",
  dues: "08_혈비",
  expenses: "09_지출",
  ledger: "10_장부",
  contribution: "11_기여도",
  contribution_detail: "12_기여도상세",
}

export function normalizeExportDatasets(input: unknown): ExportDataset[] {
  if (!Array.isArray(input) || input.length === 0) return [...EXPORT_DATASETS]
  const set = new Set<ExportDataset>()
  for (const item of input) {
    if (typeof item === "string" && (EXPORT_DATASETS as readonly string[]).includes(item)) {
      set.add(item as ExportDataset)
    }
  }
  return set.size > 0 ? EXPORT_DATASETS.filter((d) => set.has(d)) : [...EXPORT_DATASETS]
}

export function sanitizeExportFilenamePart(value: string): string {
  return value.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "")
}

export function buildExportFilename(
  serverName: string,
  guildName: string,
  dateFrom: string,
  dateTo: string,
): string {
  const server = sanitizeExportFilenamePart(serverName) || "server"
  const guild = sanitizeExportFilenamePart(guildName) || "guild"
  return `${server}_${guild}_혈맹데이터_${dateFrom}_${dateTo}.xlsx`
}

export const SENSITIVE_EXPORT_COLUMNS = [
  "auth_user_id",
  "internal_email",
  "password",
  "check_code",
  "access_token",
  "refresh_token",
  "service_role",
  "api_key",
] as const
