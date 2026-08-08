import type { SupabaseClient } from "@supabase/supabase-js"
import type { ExportDataset } from "@/lib/admin-data/export-types"
import type { PeriodType } from "@/lib/admin-data/period-utils"

export type GuildExportLogRow = {
  id: string
  guild_id: string
  exported_by: string
  period_type: string
  date_from: string | null
  date_to: string | null
  datasets: ExportDataset[]
  format: string
  row_counts: Record<string, number>
  status: "success" | "failed"
  error_message: string | null
  created_at: string
}

export async function insertExportLog(
  admin: SupabaseClient,
  input: {
    guildId: string
    exportedBy: string
    periodType: PeriodType
    dateFrom: string
    dateTo: string
    datasets: ExportDataset[]
    rowCounts: Record<string, number>
    status: "success" | "failed"
    errorMessage?: string
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("guild_export_logs")
    .insert({
      guild_id: input.guildId,
      exported_by: input.exportedBy,
      period_type: input.periodType,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      datasets: input.datasets,
      format: "xlsx",
      row_counts: input.rowCounts,
      status: input.status,
      error_message: input.errorMessage ?? null,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[insertExportLog]", error)
    return null
  }
  return data?.id ?? null
}

export async function fetchExportLogs(
  admin: SupabaseClient,
  guildId: string,
  limit = 20,
): Promise<GuildExportLogRow[]> {
  const { data, error } = await admin
    .from("guild_export_logs")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[fetchExportLogs]", error)
    return []
  }

  return (data ?? []) as GuildExportLogRow[]
}
