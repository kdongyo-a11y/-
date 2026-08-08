import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAdminDataContext } from "@/lib/admin-data/admin-data-auth"
import { resolveAdminPeriod, type PeriodType } from "@/lib/admin-data/period-utils"
import { fetchGuildScopedSnapshot } from "@/lib/admin-data/guild-scoped-data"
import { buildGuildExportWorkbook } from "@/lib/admin-data/export-workbook"
import {
  buildExportFilename,
  normalizeExportDatasets,
} from "@/lib/admin-data/export-types"
import { insertExportLog } from "@/lib/supabase/export-log-data"
import { recordUsageEventFromActor } from "@/lib/platform/usage-events"

type ExportBody = {
  period?: PeriodType
  dateFrom?: string
  dateTo?: string
  datasets?: unknown
  format?: string
  guild_id?: string
  server_id?: string
  guild_name?: string
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const ctx = await requireAdminDataContext(supabase)
  if (!ctx.ok) {
    return NextResponse.json({ ok: false, message: ctx.message }, { status: ctx.status })
  }

  let body: ExportBody = {}
  try {
    body = (await request.json()) as ExportBody
  } catch {
    return NextResponse.json({ ok: false, message: "요청 본문이 올바르지 않습니다." }, { status: 400 })
  }

  if (body.format && body.format !== "xlsx") {
    return NextResponse.json({ ok: false, message: "XLSX 형식만 지원합니다." }, { status: 400 })
  }

  const periodType = body.period ?? "this_month"
  const datasets = normalizeExportDatasets(body.datasets)

  let period
  try {
    period = resolveAdminPeriod(periodType, body.dateFrom, body.dateTo)
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "기간 오류" },
      { status: 400 },
    )
  }

  const admin = createAdminClient()
  const guildId = ctx.guildId

  try {
    const snapshot = await fetchGuildScopedSnapshot(admin, guildId, period)
    const { buffer, rowCounts } = await buildGuildExportWorkbook(snapshot, period, datasets)

    await insertExportLog(admin, {
      guildId,
      exportedBy: ctx.member.id,
      periodType: period.type,
      dateFrom: period.start,
      dateTo: period.end,
      datasets,
      rowCounts,
      status: "success",
    })

    void recordUsageEventFromActor(
      "export_completed",
      ctx.member,
      { datasetCount: datasets.length },
      admin,
    )

    const filename = buildExportFilename(
      snapshot.identity.serverName,
      snapshot.identity.guildName,
      period.start,
      period.end,
    )

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    console.error("[admin/export POST]", error)

    await insertExportLog(admin, {
      guildId,
      exportedBy: ctx.member.id,
      periodType: period.type,
      dateFrom: period.start,
      dateTo: period.end,
      datasets,
      rowCounts: {},
      status: "failed",
      errorMessage: error instanceof Error ? error.message : "export failed",
    })

    return NextResponse.json(
      { ok: false, message: "내보내기에 실패했습니다." },
      { status: 500 },
    )
  }
}
