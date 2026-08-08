import ExcelJS from "exceljs"
import { formatSlotTime } from "@/lib/boss-time-slots"
import { computeMemberContribution } from "@/lib/contribution-utils"
import type { GuildScopedSnapshot } from "@/lib/admin-data/guild-scoped-data"
import { ledgerRowToEntry } from "@/lib/admin-data/guild-scoped-data"
import type { ContributionPeriod } from "@/lib/contribution-utils"
import {
  EXPORT_SHEET_NAMES,
  type ExportDataset,
} from "@/lib/admin-data/export-types"
import { MEMBER_ROLE_LABELS } from "@/lib/member-types"
import {
  SETTLEMENT_OVERALL_STATUS_LABELS,
  SETTLEMENT_PERSONAL_STATUS_LABELS,
} from "@/lib/settlement-types"
import {
  computeGuildFundFromLedger,
  type GuildFundLedgerEntry,
} from "@/lib/guild-fund-utils"

function addSheet(workbook: ExcelJS.Workbook, name: string, headers: string[], rows: unknown[][]) {
  const sheet = workbook.addWorksheet(name)
  sheet.addRow(headers)
  for (const row of rows) sheet.addRow(row)
  sheet.getRow(1).font = { bold: true }
  return sheet
}

function bossSlotLabel(event: { event_date: string; slot_hour: number; slot_type: string }): string {
  return `${event.event_date} ${formatSlotTime(event.slot_hour)} ${event.slot_type === "main" ? "메인" : "일반"}`
}

function buildLedgerRunningBalance(
  openingBalance: number,
  ledgerRows: GuildScopedSnapshot["ledgerRows"],
): Array<{ row: ReturnType<typeof ledgerRowToEntry>; balance: number }> {
  const entries: GuildFundLedgerEntry[] = ledgerRows
    .map(ledgerRowToEntry)
    .filter((e) => !e.cancelled)
    .sort((a, b) => `${a.date}`.localeCompare(`${b.date}`))

  let balance = openingBalance
  const result: Array<{ row: ReturnType<typeof ledgerRowToEntry>; balance: number }> = []

  for (const row of entries) {
    if (row.sourceId.includes("-add-") || row.sourceId.includes("-return-")) continue
    if (row.type === "수입") balance += row.amount
    else balance -= row.amount
    result.push({ row, balance })
  }

  return result
}

export async function buildGuildExportWorkbook(
  snapshot: GuildScopedSnapshot,
  period: ContributionPeriod,
  datasets: ExportDataset[],
): Promise<{ buffer: ArrayBuffer; rowCounts: Record<string, number> }> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "RedOne Clan Manager SaaS"
  workbook.created = new Date()

  const rowCounts: Record<string, number> = {}
  const { identity, serverName, guildName } = {
    identity: snapshot.identity,
    serverName: snapshot.identity.serverName,
    guildName: snapshot.identity.guildName,
  }

  const infoSheet = workbook.addWorksheet("00_정보")
  infoSheet.addRow(["서버", serverName])
  infoSheet.addRow(["혈맹명", guildName])
  infoSheet.addRow(["조회기간", `${period.start} ~ ${period.end}`])
  infoSheet.addRow(["생성일시", new Date().toISOString()])

  if (datasets.includes("members")) {
    const rows = snapshot.members.map((m) => [
      m.nickname,
      m.class_name,
      m.level,
      m.position,
      MEMBER_ROLE_LABELS[m.role],
      m.status,
      String(m.join_date).slice(0, 10),
    ])
    addSheet(workbook, EXPORT_SHEET_NAMES.members, [
      "캐릭터명",
      "클래스",
      "레벨",
      "직책",
      "권한",
      "상태",
      "가입일",
    ], rows)
    rowCounts.members = rows.length
  }

  if (datasets.includes("boss_slots")) {
    const rows = snapshot.bossEvents.map((e) => [
      serverName,
      guildName,
      e.event_date,
      formatSlotTime(e.slot_hour),
      e.slot_type === "main" ? "메인타임" : "일반타임",
      (e.extra_main_bosses ?? []).join(", "),
      e.participation_status,
      e.income_status,
    ])
    addSheet(workbook, EXPORT_SHEET_NAMES.boss_slots, [
      "서버",
      "혈맹명",
      "날짜",
      "시간",
      "구분",
      "추가메인보스",
      "참여상태",
      "수익상태",
    ], rows)
    rowCounts.boss_slots = rows.length
  }

  if (datasets.includes("boss_participations")) {
    const eventById = new Map(snapshot.bossEvents.map((e) => [e.id, e]))
    const rows = snapshot.bossParticipations.map((p) => {
      const ev = eventById.get(p.boss_event_id)
      return [
        serverName,
        guildName,
        ev ? bossSlotLabel(ev) : "",
        snapshot.memberNames.get(p.member_id) ?? "",
        p.source === "code" ? "코드" : "수동",
        p.status === "participated" ? "참여" : "제외",
        p.memo ?? "",
      ]
    })
    addSheet(workbook, EXPORT_SHEET_NAMES.boss_participations, [
      "서버",
      "혈맹명",
      "보스타임",
      "캐릭터명",
      "참여방식",
      "참여상태",
      "메모",
    ], rows)
    rowCounts.boss_participations = rows.length
  }

  if (datasets.includes("siege")) {
    const rows = snapshot.sieges.map((s) => [
      serverName,
      guildName,
      s.eventDate,
      s.startTime,
      s.endTime,
      s.status,
      s.financialFlags.incomeDeclared ? "수익등록" : s.financialFlags.noIncomeClosed ? "무수익" : "미처리",
      s.settlementId ? "정산연결" : "없음",
    ])
    addSheet(workbook, EXPORT_SHEET_NAMES.siege, [
      "서버",
      "혈맹명",
      "날짜",
      "시작",
      "종료",
      "상태",
      "수익상태",
      "정산상태",
    ], rows)
    rowCounts.siege = rows.length
  }

  if (datasets.includes("siege_participations")) {
    const rows: unknown[][] = []
    for (const s of snapshot.sieges) {
      for (const a of s.confirmedAttendees) {
        rows.push([
          serverName,
          guildName,
          s.eventDate,
          a.name,
          a.method,
        ])
      }
    }
    addSheet(workbook, EXPORT_SHEET_NAMES.siege_participations, [
      "서버",
      "혈맹명",
      "날짜",
      "캐릭터명",
      "참여방식",
    ], rows)
    rowCounts.siege_participations = rows.length
  }

  if (datasets.includes("settlements")) {
    const rows = Object.values(snapshot.settlements).map((s) => {
      const date =
        s.sourceType === "boss"
          ? s.sourceId.slice(0, 10)
          : (s.sourceId.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "")
      return [
        date,
        s.displayTitle,
        s.displaySub,
        s.sourceType === "boss" ? "보스" : "공성",
        s.totalRevenue,
        s.guildShareFinal,
        s.distributableAmount,
        s.participants.length,
        s.perPersonAmount,
        s.revision,
        SETTLEMENT_OVERALL_STATUS_LABELS[s.overallStatus],
      ]
    })
    addSheet(workbook, EXPORT_SHEET_NAMES.settlements, [
      "날짜",
      "제목",
      "부제",
      "구분",
      "총수익",
      "혈맹귀속액",
      "개인분배대상액",
      "참여인원",
      "1인기준액",
      "revision",
      "상태",
    ], rows)
    rowCounts.settlements = rows.length
  }

  if (datasets.includes("settlement_members")) {
    const rows: unknown[][] = []
    for (const s of Object.values(snapshot.settlements)) {
      for (const p of s.participants) {
        rows.push([
          s.displayTitle,
          p.name,
          p.payoutAmount,
          p.paidAmount,
          p.additionalAmount,
          p.returnAmount,
          p.adminPaid ? "Y" : "N",
          p.memberReceived ? "Y" : "N",
          SETTLEMENT_PERSONAL_STATUS_LABELS[p.personalStatus],
        ])
      }
    }
    addSheet(workbook, EXPORT_SHEET_NAMES.settlement_members, [
      "정산",
      "캐릭터명",
      "최종정산금",
      "기존지급",
      "추가지급",
      "반환금",
      "관리자지급확인",
      "혈원수령확인",
      "상태",
    ], rows)
    rowCounts.settlement_members = rows.length
  }

  if (datasets.includes("dues")) {
    const rows: unknown[][] = []
    for (const b of snapshot.duesBills) {
      for (const item of Object.values(b.items)) {
        rows.push([
          b.yearMonth,
          item.nickname,
          b.amountPerMember,
          item.status === "PAID" ? "납부" : item.status === "PAYMENT_REPORTED" ? "납부신고" : "미납",
        ])
      }
    }
    addSheet(workbook, EXPORT_SHEET_NAMES.dues, ["혈비월", "캐릭터명", "부과액", "상태"], rows)
    rowCounts.dues = rows.length
  }

  if (datasets.includes("expenses")) {
    const rows = snapshot.expenses.map((e) => [
      e.expenseDate,
      e.expenseType,
      e.target,
      e.description,
      e.amount,
      e.cancelled ? "취소" : "활성",
    ])
    addSheet(workbook, EXPORT_SHEET_NAMES.expenses, [
      "날짜",
      "유형",
      "대상",
      "내용",
      "금액",
      "상태",
    ], rows)
    rowCounts.expenses = rows.length
  }

  if (datasets.includes("ledger")) {
    const running = buildLedgerRunningBalance(snapshot.openingBalance, snapshot.ledgerRows)
    const rows = running.map(({ row, balance }) => [
      row.date,
      row.type,
      row.sourceType,
      row.category,
      row.type === "수입" ? row.amount : "",
      row.type === "지출" ? row.amount : "",
      balance,
    ])
    addSheet(workbook, EXPORT_SHEET_NAMES.ledger, [
      "날짜",
      "구분",
      "source",
      "내용",
      "수입",
      "지출",
      "잔액",
    ], rows)
    rowCounts.ledger = rows.length
  }

  if (datasets.includes("contribution")) {
    const rows: unknown[][] = []
    for (const m of snapshot.members) {
      const result = computeMemberContribution(
        m.id,
        period,
        snapshot.checks,
        snapshot.sieges,
        snapshot.scoreSettings,
      )
      rows.push([
        m.nickname,
        `${period.start}~${period.end}`,
        result.breakdown.generalCount,
        result.breakdown.generalPoints,
        result.breakdown.mainCount,
        result.breakdown.mainPoints,
        result.breakdown.siegeCount,
        result.breakdown.siegePoints,
        result.breakdown.total,
      ])
    }
    addSheet(workbook, EXPORT_SHEET_NAMES.contribution, [
      "캐릭터명",
      "기간",
      "일반보스횟수",
      "일반보스점수",
      "메인보스횟수",
      "메인보스점수",
      "공성횟수",
      "공성점수",
      "총점",
    ], rows)
    rowCounts.contribution = rows.length
  }

  if (datasets.includes("contribution_detail")) {
    const rows: unknown[][] = []
    for (const m of snapshot.members) {
      const result = computeMemberContribution(
        m.id,
        period,
        snapshot.checks,
        snapshot.sieges,
        snapshot.scoreSettings,
      )
      for (const ev of result.events) {
        rows.push([
          ev.date,
          m.nickname,
          ev.label,
          ev.kind === "siege" ? "공성" : ev.kind === "main" ? "메인보스" : "일반보스",
          ev.points,
          ev.sub,
        ])
      }
    }
    addSheet(workbook, EXPORT_SHEET_NAMES.contribution_detail, [
      "날짜",
      "캐릭터명",
      "활동",
      "구분",
      "적용점수",
      "비고",
    ], rows)
    rowCounts.contribution_detail = rows.length
  }

  // sanity: fund matches ledger utility for info sheet
  const fundEntries = snapshot.ledgerRowsAll.map(ledgerRowToEntry).map((e) => ({
    date: e.date,
    type: e.type,
    amount: e.amount,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    cancelled: e.cancelled,
  }))
  infoSheet.addRow(["현재혈맹자금", computeGuildFundFromLedger(snapshot.openingBalance, fundEntries)])

  const buffer = await workbook.xlsx.writeBuffer()
  return { buffer, rowCounts }
}
