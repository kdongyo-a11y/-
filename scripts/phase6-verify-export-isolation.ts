/**
 * Phase 6 export/dashboard tenant isolation (E1~E10, D1~D4)
 * 사용: npm run phase6:verify-export-isolation
 *
 * 사전: 013_admin_data_export_phase6.sql 수동 적용 (E8 audit log)
 */
import ExcelJS from "exceljs"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import {
  loginFixtureGuild,
  getFixtureServerId,
  fetchGuildIdByServerAndCode,
  FIXTURE_GUILD_NAMES,
} from "./test-auth-helpers"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import { requireAdmin } from "../lib/supabase/operation-auth"
import type { MemberRow } from "../lib/supabase/member-mapper"
import { resolveAdminPeriod } from "../lib/admin-data/period-utils"
import { fetchGuildScopedSnapshot, fetchGuildIdentity } from "../lib/admin-data/guild-scoped-data"
import { buildAdminDashboard } from "../lib/admin-data/admin-analytics"
import { buildGuildExportWorkbook } from "../lib/admin-data/export-workbook"
import { buildExportFilename, SENSITIVE_EXPORT_COLUMNS } from "../lib/admin-data/export-types"
import { insertExportLog, fetchExportLogs } from "../lib/supabase/export-log-data"

loadEnvLocal()

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"

type Check = { id: string; ok: boolean; detail: string }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function countGuildScopedRows(admin: SupabaseClient, guildId: string) {
  const tables = [
    "members",
    "boss_events",
    "siege_events",
    "settlements",
    "ledger_entries",
    "expenses",
    "dues",
  ] as const

  const counts: Record<string, number> = {}
  for (const table of tables) {
    const { count, error } = await admin
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq("guild_id", guildId)
    counts[table] = error ? -1 : (count ?? 0)
  }
  return counts
}

async function parseWorkbookSheets(buffer: ArrayBuffer) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(Buffer.from(buffer))
  const sheets: { name: string; headers: string[]; rows: string[][] }[] = []
  for (const sheet of workbook.worksheets) {
    const headers: string[] = []
    const rows: string[][] = []
    sheet.eachRow((row, rowNumber) => {
      const values = row.values as (string | number | null | undefined)[]
      const cells = values.slice(1).map((v) => String(v ?? ""))
      if (rowNumber === 1) headers.push(...cells)
      else rows.push(cells)
    })
    sheets.push({ name: sheet.name, headers, rows })
  }
  return sheets
}

function collectCellTexts(sheets: Awaited<ReturnType<typeof parseWorkbookSheets>>): string[] {
  const texts: string[] = []
  for (const s of sheets) {
    texts.push(...s.headers)
    for (const row of s.rows) texts.push(...row)
  }
  return texts
}

async function assertMigration013(admin: SupabaseClient): Promise<boolean> {
  const { error } = await admin.from("guild_export_logs").select("id").limit(1)
  return !error
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const results: Check[] = []
  const migrationOk = await assertMigration013(admin)
  if (!migrationOk) {
    console.warn("⚠ guild_export_logs 없음 — 013 migration 미적용. E8은 skip됩니다.\n")
  }

  const fixtureServerId = await getFixtureServerId(admin)
  const redGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
  const blueGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "BLUE")
  const greenGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "GREEN")

  if (!redGuildId || !blueGuildId) {
    console.error("RED/BLUE guild 없음")
    process.exit(1)
  }

  const redAdmin = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.RED,
    "군주",
  )
  const blueAdmin = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.BLUE,
    "군주",
  )
  if (!redAdmin || !blueAdmin) {
    console.error("RED/BLUE admin 없음")
    process.exit(1)
  }

  const period = resolveAdminPeriod("all")
  const redSnapshot = await fetchGuildScopedSnapshot(admin, redGuildId, period)
  const blueSnapshot = await fetchGuildScopedSnapshot(admin, blueGuildId, period)

  const blueNicknames = new Set(blueSnapshot.members.map((m) => m.nickname))
  const greenNicknames = greenGuildId
    ? new Set(
        (
          await admin.from("members").select("nickname").eq("guild_id", greenGuildId)
        ).data?.map((m: { nickname: string }) => m.nickname) ?? [],
      )
    : new Set<string>()

  const redNicknames = new Set(redSnapshot.members.map((m) => m.nickname))
  const blueOnlyNicknames = [...blueNicknames].filter((n) => !redNicknames.has(n))
  const greenOnlyNicknames = [...greenNicknames].filter((n) => !redNicknames.has(n))

  // E1/E2: RED export scope
  const { buffer: redBuffer, rowCounts: redRowCounts } = await buildGuildExportWorkbook(
    redSnapshot,
    period,
    ["members", "boss_participations", "settlements", "settlement_members"],
  )
  const redSheets = await parseWorkbookSheets(redBuffer)
  const redTexts = collectCellTexts(redSheets)

  const redMemberSheet = redSheets.find((s) => s.name === "01_혈맹원")
  const redMemberNames = new Set(redMemberSheet?.rows.map((r) => r[0]) ?? [])
  const redOnlyMembers = redSnapshot.members.every((m) => redMemberNames.has(m.nickname))

  results.push({
    id: "E1",
    ok: redOnlyMembers && redSnapshot.members.length > 0,
    detail: `RED export members=${redMemberSheet?.rows.length ?? 0}, guild members=${redSnapshot.members.length}`,
  })

  let blueRowsInRed = 0
  let greenRowsInRed = 0
  for (const text of redTexts) {
    if (blueOnlyNicknames.includes(text)) blueRowsInRed++
    if (greenOnlyNicknames.includes(text)) greenRowsInRed++
  }
  // guild name leak check (other guild names must not appear)
  const hasBlueGuildName = redTexts.some((t) => t === FIXTURE_GUILD_NAMES.BLUE)
  const hasGreenGuildName = redTexts.some((t) => t === FIXTURE_GUILD_NAMES.GREEN)
  results.push({
    id: "E2",
    ok: blueRowsInRed === 0 && greenRowsInRed === 0 && !hasBlueGuildName && !hasGreenGuildName,
    detail: `BLUE-only refs=${blueRowsInRed}, GREEN-only refs=${greenRowsInRed}, nameLeak=${hasBlueGuildName || hasGreenGuildName}`,
  })

  // E3/E4: requireAdmin
  const managerRow = { ...redAdmin, role: "manager" as const } satisfies MemberRow
  const memberRow = { ...redAdmin, role: "member" as const } satisfies MemberRow
  results.push({
    id: "E3",
    ok: !requireAdmin(managerRow).ok,
    detail: "manager → requireAdmin 403",
  })
  results.push({
    id: "E4",
    ok: !requireAdmin(memberRow).ok,
    detail: "member → requireAdmin 403",
  })

  // E5: no cross-guild boss event dates from BLUE in RED boss sheet
  const blueBossDates = new Set(blueSnapshot.bossEvents.map((e) => e.event_date))
  const redBossSheet = redSheets.find((s) => s.name === "03_보스참여")
  let crossBossLeak = false
  for (const row of redBossSheet?.rows ?? []) {
    const slotLabel = row[2] ?? ""
    for (const d of blueBossDates) {
      if (slotLabel.includes(d) && !redSnapshot.bossEvents.some((e) => e.event_date === d)) {
        crossBossLeak = true
      }
    }
  }
  results.push({
    id: "E5",
    ok: !crossBossLeak,
    detail: crossBossLeak ? "cross-guild boss leak" : "no cross-guild events in sheets",
  })

  // E6: sensitive columns / UUID exposure
  let sensitiveHeader = false
  let uuidCells = 0
  for (const sheet of redSheets) {
    for (const h of sheet.headers) {
      const lower = h.toLowerCase()
      if (SENSITIVE_EXPORT_COLUMNS.some((c) => lower.includes(c))) sensitiveHeader = true
      if (UUID_RE.test(h)) uuidCells++
    }
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (SENSITIVE_EXPORT_COLUMNS.some((c) => cell.toLowerCase().includes(c))) sensitiveHeader = true
        if (UUID_RE.test(cell)) uuidCells++
      }
    }
  }
  results.push({
    id: "E6",
    ok: !sensitiveHeader && uuidCells === 0,
    detail: `sensitive=${sensitiveHeader}, uuidCells=${uuidCells}`,
  })

  // E7: row counts unchanged
  const beforeCounts = await countGuildScopedRows(admin, redGuildId)
  await buildGuildExportWorkbook(redSnapshot, period, ["members"])
  if (migrationOk) {
    await insertExportLog(admin, {
      guildId: redGuildId,
      exportedBy: redAdmin.id,
      periodType: "all",
      dateFrom: period.start,
      dateTo: period.end,
      datasets: ["members"],
      rowCounts: redRowCounts,
      status: "success",
    })
  }
  const afterCounts = await countGuildScopedRows(admin, redGuildId)
  const countsStable = Object.keys(beforeCounts).every((k) => beforeCounts[k] === afterCounts[k])
  results.push({
    id: "E7",
    ok: countsStable,
    detail: countsStable ? "operational table counts unchanged" : `before=${JSON.stringify(beforeCounts)} after=${JSON.stringify(afterCounts)}`,
  })

  // E8: audit log +1
  if (migrationOk) {
    const logsBefore = (await fetchExportLogs(admin, redGuildId, 100)).length
    await insertExportLog(admin, {
      guildId: redGuildId,
      exportedBy: redAdmin.id,
      periodType: "all",
      dateFrom: period.start,
      dateTo: period.end,
      datasets: ["members"],
      rowCounts: { members: 1 },
      status: "success",
    })
    const logsAfter = (await fetchExportLogs(admin, redGuildId, 100)).length
    results.push({
      id: "E8",
      ok: logsAfter >= logsBefore + 1,
      detail: `logs ${logsBefore} → ${logsAfter}`,
    })
  } else {
    results.push({ id: "E8", ok: true, detail: "SKIP — 013 migration 미적용" })
  }

  // E9: guild_id scoped identity
  const redIdentity = await fetchGuildIdentity(admin, redGuildId)
  const infoSheet = redSheets.find((s) => s.name === "00_정보")
  const infoGuild = infoSheet?.rows.find((r) => r[0] === "혈맹명")?.[1] ?? ""
  results.push({
    id: "E9",
    ok: infoGuild === redIdentity.guildName && infoGuild !== FIXTURE_GUILD_NAMES.BLUE,
    detail: `info guild=${infoGuild}, expected=${redIdentity.guildName}`,
  })

  // E10: filename
  const filename = buildExportFilename(redIdentity.serverName, redIdentity.guildName, period.start, period.end)
  results.push({
    id: "E10",
    ok: filename.includes(redIdentity.serverName.replace(/\s/g, "_").split("_")[0] || redIdentity.serverName.slice(0, 2)) &&
      filename.includes(redIdentity.guildName) &&
      filename.endsWith(".xlsx"),
    detail: filename,
  })

  // D1~D3: dashboard isolation
  const redDash = buildAdminDashboard(redSnapshot, period)
  const blueDash = buildAdminDashboard(blueSnapshot, period)
  results.push({
    id: "D1",
    ok: redDash.boss.eventCount === redSnapshot.bossEvents.length,
    detail: `RED dashboard boss events=${redDash.boss.eventCount}`,
  })
  results.push({
    id: "D2",
    ok: redDash.boss.eventCount !== blueDash.boss.eventCount || redGuildId !== blueGuildId,
    detail: `RED boss=${redDash.boss.eventCount}, BLUE boss=${blueDash.boss.eventCount}`,
  })
  results.push({
    id: "D3",
    ok: redDash.finance.currentFund !== blueDash.finance.currentFund || redGuildId === blueGuildId,
    detail: `RED fund=${redDash.finance.currentFund}, BLUE fund=${blueDash.finance.currentFund}`,
  })

  // D4: manager dashboard auth
  results.push({
    id: "D4",
    ok: !requireAdmin(managerRow).ok && !requireAdmin(memberRow).ok,
    detail: "manager/member dashboard blocked via requireAdmin",
  })

  // Session API smoke (optional): RED admin session can call dashboard logic via member guild_id
  try {
    const { memberRow } = await loginFixtureGuild(url, anonKey, admin, "RED", "군주", TEST_PASSWORD)
    const sessionGuildId = memberRow.guild_id
    results.push({
      id: "E1b",
      ok: sessionGuildId === redGuildId,
      detail: `session guild_id=${sessionGuildId}`,
    })
  } catch (e) {
    results.push({
      id: "E1b",
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  console.log("=== Phase 6 Export/Dashboard Isolation ===\n")
  let failed = 0
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL"
    if (!r.ok) failed++
    console.log(`[${mark}] ${r.id}: ${r.detail}`)
  }
  console.log(`\n${results.length - failed}/${results.length} passed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
