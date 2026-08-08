import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildChecksFromRows,
  type BossEventRow,
  type BossParticipationLogRow,
  type BossParticipationRow,
} from "@/lib/supabase/boss-mapper"
import { buildSiegesFromRows } from "@/lib/supabase/siege-mapper"
import {
  buildSettlementsFromRows,
  type SettlementMemberRow,
  type SettlementModificationLogRow,
  type SettlementRevisionRow,
  type SettlementRow,
} from "@/lib/supabase/settlement-mapper"
import {
  buildDuesBillsFromRows,
  ledgerRowToEntry,
  expenseRowToExpense,
  type DueChangeLogRow,
  type DueMemberRow,
  type DuesRow,
  type ExpenseChangeLogRow,
  type ExpenseRow,
  type FinanceSettingsRow,
  type LedgerEntryRow,
} from "@/lib/supabase/finance-data"
import { fetchContributionScoreSettings } from "@/lib/supabase/admin-settings-data"
import type { MemberRow } from "@/lib/supabase/member-mapper"
import type { ContributionPeriod } from "@/lib/contribution-utils"
import { isDateInRange } from "@/lib/admin-data/period-utils"
import type { Settlement } from "@/lib/settlement-types"
import { isSettlementComplete } from "@/lib/settlement-utils"

export type GuildIdentity = {
  guildId: string
  guildName: string
  serverName: string
}

export type GuildScopedSnapshot = {
  identity: GuildIdentity
  members: MemberRow[]
  memberNames: Map<string, string>
  bossEvents: BossEventRow[]
  bossParticipations: BossParticipationRow[]
  checks: ReturnType<typeof buildChecksFromRows>["checks"]
  sieges: ReturnType<typeof buildSiegesFromRows>
  settlements: Record<string, Settlement>
  openingBalance: number
  ledgerRows: LedgerEntryRow[]
  ledgerRowsAll: LedgerEntryRow[]
  expenses: ReturnType<typeof expenseRowToExpense>[]
  duesBills: ReturnType<typeof buildDuesBillsFromRows>
  scoreSettings: Awaited<ReturnType<typeof fetchContributionScoreSettings>>
}

export async function fetchGuildIdentity(
  admin: SupabaseClient,
  guildId: string,
): Promise<GuildIdentity> {
  const { data, error } = await admin
    .from("guilds")
    .select("id, guild_name, game_servers(server_name)")
    .eq("id", guildId)
    .maybeSingle()

  if (error || !data) throw new Error("혈맹 정보를 찾을 수 없습니다.")

  const serverRow = Array.isArray(data.game_servers) ? data.game_servers[0] : data.game_servers

  return {
    guildId: data.id,
    guildName: data.guild_name,
    serverName: serverRow?.server_name ?? "",
  }
}

export async function fetchGuildScopedSnapshot(
  admin: SupabaseClient,
  guildId: string,
  period: ContributionPeriod,
): Promise<GuildScopedSnapshot> {
  const identity = await fetchGuildIdentity(admin, guildId)

  const { data: memberRows, error: membersError } = await admin
    .from("members")
    .select("*")
    .eq("guild_id", guildId)
    .order("nickname")

  if (membersError) throw membersError

  const members = (memberRows ?? []) as MemberRow[]
  const memberNames = new Map(members.map((m) => [m.id, m.nickname]))
  const memberIds = new Set(members.map((m) => m.id))

  const { data: bossEvents, error: bossError } = await admin
    .from("boss_events")
    .select("*")
    .eq("guild_id", guildId)
    .gte("event_date", period.start)
    .lte("event_date", period.end)
    .order("event_date")
    .order("slot_hour")

  if (bossError) throw bossError

  const eventRows = (bossEvents ?? []) as BossEventRow[]
  const eventIds = eventRows.map((e) => e.id)

  let bossParticipations: BossParticipationRow[] = []
  let bossLogs: BossParticipationLogRow[] = []

  if (eventIds.length > 0) {
    const [partRes, logRes] = await Promise.all([
      admin.from("boss_participations").select("*").in("boss_event_id", eventIds),
      admin.from("boss_participation_logs").select("*").in("boss_event_id", eventIds),
    ])
    if (partRes.error) throw partRes.error
    if (logRes.error) throw logRes.error
    bossParticipations = (partRes.data ?? []) as BossParticipationRow[]
    bossLogs = (logRes.data ?? []) as BossParticipationLogRow[]
  }

  const { checks } = buildChecksFromRows(eventRows, bossParticipations, bossLogs, memberNames)

  const { data: siegeEvents, error: siegeError } = await admin
    .from("siege_events")
    .select("*")
    .eq("guild_id", guildId)
    .gte("event_date", period.start)
    .lte("event_date", period.end)
    .order("event_date", { ascending: false })

  if (siegeError) throw siegeError

  const siegeEventRows = siegeEvents ?? []
  const siegeIds = siegeEventRows.map((e: { id: string }) => e.id)

  let sieges: ReturnType<typeof buildSiegesFromRows> = []
  if (siegeIds.length > 0) {
    const [surveysRes, partsRes, adminLogsRes, attendanceLogsRes] = await Promise.all([
      admin.from("siege_surveys").select("*").in("siege_event_id", siegeIds),
      admin.from("siege_participations").select("*").in("siege_event_id", siegeIds),
      admin.from("siege_admin_logs").select("*").in("siege_event_id", siegeIds),
      admin.from("siege_attendance_logs").select("*").in("siege_event_id", siegeIds),
    ])
    if (surveysRes.error) throw surveysRes.error
    if (partsRes.error) throw partsRes.error
    if (adminLogsRes.error) throw adminLogsRes.error
    if (attendanceLogsRes.error) throw attendanceLogsRes.error

    sieges = buildSiegesFromRows(
      siegeEventRows,
      surveysRes.data ?? [],
      partsRes.data ?? [],
      adminLogsRes.data ?? [],
      attendanceLogsRes.data ?? [],
      memberNames,
    )
  }

  const { data: settlementRows, error: settlementError } = await admin
    .from("settlements")
    .select("*")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })

  if (settlementError) throw settlementError

  const settlementHeaderRows = (settlementRows ?? []) as SettlementRow[]
  const settlementIds = settlementHeaderRows.map((r) => r.id)

  let settlements: Record<string, Settlement> = {}
  if (settlementIds.length > 0) {
    const [membersRes, revisionsRes, logsRes] = await Promise.all([
      admin.from("settlement_members").select("*").in("settlement_id", settlementIds),
      admin.from("settlement_revisions").select("*").in("settlement_id", settlementIds),
      admin.from("settlement_modification_logs").select("*").in("settlement_id", settlementIds),
    ])
    if (membersRes.error) throw membersRes.error
    if (revisionsRes.error) throw revisionsRes.error
    if (logsRes.error) throw logsRes.error

    settlements = buildSettlementsFromRows(
      settlementHeaderRows,
      (membersRes.data ?? []) as SettlementMemberRow[],
      (revisionsRes.data ?? []) as SettlementRevisionRow[],
      (logsRes.data ?? []) as SettlementModificationLogRow[],
      memberNames,
    )
  }

  const filteredSettlements = Object.fromEntries(
    Object.entries(settlements).filter(([, s]) => {
      const date =
        s.sourceType === "boss"
          ? s.sourceId.slice(0, 10)
          : (s.sourceId.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? period.end)
      return isDateInRange(date, period)
    }),
  )

  const [settingsRes, ledgerRes, expensesRes, expenseLogsRes, duesRes, dueMembersRes, dueLogsRes, scoreSettings] =
    await Promise.all([
      admin.from("guild_finance_settings").select("*").eq("guild_id", guildId).maybeSingle(),
      admin
        .from("ledger_entries")
        .select("*")
        .eq("guild_id", guildId)
        .order("transaction_date"),
      admin
        .from("expenses")
        .select("*")
        .eq("guild_id", guildId)
        .gte("expense_date", period.start)
        .lte("expense_date", period.end)
        .order("expense_date", { ascending: false }),
      admin.from("expense_change_logs").select("*").order("created_at", { ascending: false }),
      admin.from("dues").select("*").eq("guild_id", guildId).order("created_at", { ascending: false }),
      admin.from("due_members").select("*"),
      admin.from("due_change_logs").select("*").order("created_at", { ascending: false }),
      fetchContributionScoreSettings(admin, guildId),
    ])

  if (settingsRes.error) throw settingsRes.error
  if (ledgerRes.error) throw ledgerRes.error
  if (expensesRes.error) throw expensesRes.error
  if (expenseLogsRes.error) throw expenseLogsRes.error
  if (duesRes.error) throw duesRes.error
  if (dueMembersRes.error) throw dueMembersRes.error
  if (dueLogsRes.error) throw dueLogsRes.error

  const dueIds = new Set(((duesRes.data ?? []) as DuesRow[]).map((d) => d.id))
  const scopedDueMembers = ((dueMembersRes.data ?? []) as DueMemberRow[]).filter((m) =>
    dueIds.has(m.due_id),
  )
  const scopedDueLogs = ((dueLogsRes.data ?? []) as DueChangeLogRow[]).filter((l) =>
    dueIds.has(l.due_id),
  )

  const duesBills = buildDuesBillsFromRows(
    (duesRes.data ?? []) as DuesRow[],
    scopedDueMembers,
    scopedDueLogs,
    memberNames,
  ).filter((b) => b.yearMonth >= period.start.slice(0, 7) && b.yearMonth <= period.end.slice(0, 7))

  const logsByExpense = new Map<string, ExpenseChangeLogRow[]>()
  for (const l of (expenseLogsRes.data ?? []) as ExpenseChangeLogRow[]) {
    const list = logsByExpense.get(l.expense_id) ?? []
    list.push(l)
    logsByExpense.set(l.expense_id, list)
  }

  const ledgerRowsAll = (ledgerRes.data ?? []) as LedgerEntryRow[]
  const ledgerRows = ledgerRowsAll.filter(
    (row) => row.transaction_date >= period.start && row.transaction_date <= period.end,
  )
  const ledgerByExpenseSource = new Map<string, string>()
  for (const row of ledgerRowsAll) {
    if (row.source_type === "expense" && !row.cancelled) {
      ledgerByExpenseSource.set(row.source_id, row.id)
    }
  }

  const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).map((row) =>
    expenseRowToExpense(row, logsByExpense.get(row.id) ?? [], ledgerByExpenseSource.get(row.id) ?? null),
  )

  const openingBalance = Number((settingsRes.data as FinanceSettingsRow | null)?.opening_balance ?? 0)

  // Defensive: strip cross-guild member refs if any
  bossParticipations = bossParticipations.filter((p) => memberIds.has(p.member_id))

  return {
    identity,
    members,
    memberNames,
    bossEvents: eventRows,
    bossParticipations,
    checks,
    sieges,
    settlements: filteredSettlements,
    openingBalance,
    ledgerRows,
    ledgerRowsAll,
    expenses,
    duesBills,
    scoreSettings,
  }
}

export function countUnsettledParticipants(settlements: Record<string, Settlement>): number {
  let count = 0
  for (const s of Object.values(settlements)) {
    for (const p of s.participants) {
      if (!isSettlementComplete(p.adminPaid, p.memberReceived)) count++
    }
  }
  return count
}

export { ledgerRowToEntry }
