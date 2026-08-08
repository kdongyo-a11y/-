import { formatSlotTime } from "@/lib/boss-time-slots"
import {
  computeGuildContributionSummary,
  type ContributionPeriod,
} from "@/lib/contribution-utils"
import {
  computeGuildFundFromLedger,
  sumActiveExpenses,
  sumDuesIncome,
  sumSettlementGuildShareIncome,
  type GuildFundLedgerEntry,
} from "@/lib/guild-fund-utils"
import type { GuildScopedSnapshot } from "@/lib/admin-data/guild-scoped-data"
import { ledgerRowToEntry } from "@/lib/admin-data/guild-scoped-data"
import { isSettlementComplete } from "@/lib/settlement-utils"

function settlementDisplayDate(sourceType: string, sourceId: string): string {
  if (sourceType === "boss") return sourceId.slice(0, 10)
  return sourceId.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? sourceId
}

function toGuildFundEntries(snapshot: GuildScopedSnapshot): GuildFundLedgerEntry[] {
  return snapshot.ledgerRows.map((row) => {
    const entry = ledgerRowToEntry(row)
    return {
      date: entry.date,
      type: entry.type,
      amount: entry.amount,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      cancelled: entry.cancelled,
    }
  })
}

export type AdminDashboardData = {
  period: ContributionPeriod
  members: { active: number; dormant: number; withdrawn: number }
  boss: {
    eventCount: number
    participationCount: number
    uniqueParticipants: number
  }
  siege: { eventCount: number; participationCount: number; uniqueParticipants: number }
  settlement: {
    total: number
    completed: number
    inProgress: number
    unsettledParticipants: number
  }
  dues: {
    targetMembers: number
    paidMembers: number
    unpaidMembers: number
    paymentRate: number
  }
  finance: {
    openingBalance: number
    guildIncome: number
    duesIncome: number
    expenseTotal: number
    currentFund: number
  }
  recentActivity: Array<{
    kind: "boss" | "siege" | "settlement"
    date: string
    title: string
    sub: string
  }>
}

export function buildAdminDashboard(snapshot: GuildScopedSnapshot, period: ContributionPeriod): AdminDashboardData {
  const members = {
    active: snapshot.members.filter((m) => m.status === "활동").length,
    dormant: snapshot.members.filter((m) => m.status === "휴면").length,
    withdrawn: snapshot.members.filter((m) => m.status === "탈퇴").length,
  }

  const bossParticipationRows = snapshot.bossParticipations.filter((p) => p.status === "participated")
  const bossUnique = new Set(bossParticipationRows.map((p) => p.member_id))

  const siegeParticipations = snapshot.sieges.flatMap((s) => s.confirmedAttendees)
  const siegeUnique = new Set(siegeParticipations.map((a) => a.memberId))

  const settlementList = Object.values(snapshot.settlements)
  let unsettledParticipants = 0
  let completed = 0
  let inProgress = 0
  for (const s of settlementList) {
    if (s.overallStatus === "completed") completed++
    else inProgress++
    for (const p of s.participants) {
      if (!isSettlementComplete(p.adminPaid, p.memberReceived)) unsettledParticipants++
    }
  }

  let duesTarget = 0
  let duesPaid = 0
  for (const bill of snapshot.duesBills) {
    for (const item of Object.values(bill.items)) {
      duesTarget++
      if (item.status === "PAID") duesPaid++
    }
  }
  const duesUnpaid = Math.max(0, duesTarget - duesPaid)

  const fundEntries = toGuildFundEntries(snapshot)
  const periodEntries = fundEntries.filter(
    (e) => e.date >= period.start && e.date <= period.end,
  )
  const duesIncome = sumDuesIncome(periodEntries)
  const guildIncome = sumSettlementGuildShareIncome(periodEntries)
  const expenseTotal = sumActiveExpenses(periodEntries)
  const allFundEntries = snapshot.ledgerRowsAll.map((row) => {
    const entry = ledgerRowToEntry(row)
    return {
      date: entry.date,
      type: entry.type,
      amount: entry.amount,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      cancelled: entry.cancelled,
    }
  })

  const recentActivity: AdminDashboardData["recentActivity"] = []

  for (const e of [...snapshot.bossEvents].sort((a, b) => {
    const da = `${a.event_date} ${String(a.slot_hour).padStart(2, "0")}`
    const db = `${b.event_date} ${String(b.slot_hour).padStart(2, "0")}`
    return db.localeCompare(da)
  }).slice(0, 5)) {
    recentActivity.push({
      kind: "boss",
      date: e.event_date,
      title: `${formatSlotTime(e.slot_hour)} ${e.slot_type === "main" ? "메인타임" : "일반타임"}`,
      sub: `참여 ${snapshot.bossParticipations.filter((p) => p.boss_event_id === e.id && p.status === "participated").length}명`,
    })
  }

  for (const s of [...snapshot.sieges].slice(0, 3)) {
    recentActivity.push({
      kind: "siege",
      date: s.eventDate,
      title: "공성",
      sub: `${s.confirmedAttendees.length}명 참여 확정`,
    })
  }

  for (const s of settlementList.slice(0, 3)) {
    recentActivity.push({
      kind: "settlement",
      date: settlementDisplayDate(s.sourceType, s.sourceId),
      title: s.displayTitle,
      sub: s.displaySub,
    })
  }

  recentActivity.sort((a, b) => b.date.localeCompare(a.date))
  recentActivity.splice(10)

  return {
    period,
    members,
    boss: {
      eventCount: snapshot.bossEvents.length,
      participationCount: bossParticipationRows.length,
      uniqueParticipants: bossUnique.size,
    },
    siege: {
      eventCount: snapshot.sieges.length,
      participationCount: siegeParticipations.length,
      uniqueParticipants: siegeUnique.size,
    },
    settlement: {
      total: settlementList.length,
      completed,
      inProgress,
      unsettledParticipants,
    },
    dues: {
      targetMembers: duesTarget,
      paidMembers: duesPaid,
      unpaidMembers: duesUnpaid,
      paymentRate: duesTarget > 0 ? Math.round((duesPaid / duesTarget) * 1000) / 10 : 0,
    },
    finance: {
      openingBalance: snapshot.openingBalance,
      guildIncome,
      duesIncome,
      expenseTotal,
      currentFund: computeGuildFundFromLedger(snapshot.openingBalance, allFundEntries),
    },
    recentActivity,
  }
}

export type AdminAggregatesData = {
  period: ContributionPeriod
  bossByDate: Array<{ date: string; events: number; participations: number; participants: number }>
  siegeByEvent: Array<{ date: string; title: string; participants: number }>
  settlementSummary: Array<{
    title: string
    totalRevenue: number
    guildShare: number
    distributable: number
    status: string
    participants: number
  }>
  duesByMonth: Array<{ month: string; target: number; paid: number; unpaid: number }>
  expensesByMonth: Array<{ month: string; total: number }>
  ledgerSummary: { income: number; expense: number; netChange: number }
  contributionRanked: Array<{
    nickname: string
    generalCount: number
    generalPoints: number
    mainCount: number
    mainPoints: number
    siegeCount: number
    siegePoints: number
    total: number
  }>
}

export function buildAdminAggregates(snapshot: GuildScopedSnapshot, period: ContributionPeriod): AdminAggregatesData {
  const bossMap = new Map<string, { events: number; participations: number; members: Set<string> }>()
  for (const e of snapshot.bossEvents) {
    const row = bossMap.get(e.event_date) ?? { events: 0, participations: 0, members: new Set<string>() }
    row.events++
    const parts = snapshot.bossParticipations.filter(
      (p) => p.boss_event_id === e.id && p.status === "participated",
    )
    row.participations += parts.length
    for (const p of parts) row.members.add(p.member_id)
    bossMap.set(e.event_date, row)
  }

  const bossByDate = [...bossMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      events: v.events,
      participations: v.participations,
      participants: v.members.size,
    }))

  const siegeByEvent = snapshot.sieges.map((s) => ({
    date: s.eventDate,
    title: `${s.eventDate} 공성`,
    participants: s.confirmedAttendees.length,
  }))

  const settlementSummary = Object.values(snapshot.settlements).map((s) => ({
    title: s.displayTitle,
    totalRevenue: s.totalRevenue,
    guildShare: s.guildShareFinal,
    distributable: s.distributableAmount,
    status: s.overallStatus,
    participants: s.participants.length,
  }))

  const duesByMonth = snapshot.duesBills.map((b) => {
    const items = Object.values(b.items)
    const paid = items.filter((i) => i.status === "PAID").length
    return {
      month: b.yearMonth,
      target: items.length,
      paid,
      unpaid: items.length - paid,
    }
  })

  const expenseMonthMap = new Map<string, number>()
  for (const e of snapshot.expenses) {
    if (e.cancelled) continue
    const ym = e.expenseDate.slice(0, 7)
    expenseMonthMap.set(ym, (expenseMonthMap.get(ym) ?? 0) + e.amount)
  }
  const expensesByMonth = [...expenseMonthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }))

  const fundEntries = toGuildFundEntries(snapshot)
  let income = 0
  let expense = 0
  for (const e of fundEntries) {
    if (e.cancelled) continue
    if (e.type === "수입") income += e.amount
    else expense += e.amount
  }

  const memberIds = snapshot.members.map((m) => m.id)
  const contribution = computeGuildContributionSummary(
    memberIds,
    period,
    snapshot.checks,
    snapshot.sieges,
    snapshot.scoreSettings,
  )

  const contributionRanked = contribution.ranked.map((r) => ({
    nickname: snapshot.memberNames.get(r.memberId) ?? "",
    generalCount: r.breakdown.generalCount,
    generalPoints: r.breakdown.generalPoints,
    mainCount: r.breakdown.mainCount,
    mainPoints: r.breakdown.mainPoints,
    siegeCount: r.breakdown.siegeCount,
    siegePoints: r.breakdown.siegePoints,
    total: r.breakdown.total,
  }))

  return {
    period,
    bossByDate,
    siegeByEvent,
    settlementSummary,
    duesByMonth,
    expensesByMonth,
    ledgerSummary: { income, expense, netChange: income - expense },
    contributionRanked,
  }
}
