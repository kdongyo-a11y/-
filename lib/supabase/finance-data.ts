import type { SupabaseClient } from "@supabase/supabase-js"
import { getTodayDateString } from "@/lib/boss-time-slots"
import type { LedgerEntry } from "@/components/guild-ledger-context"
import type { Expense, ExpenseChangeLog } from "@/lib/expense-types"
import type { DuesBill, DuesChangeLog, DuesPaymentStatus } from "@/lib/dues-types"
import { formatYearMonthLabel } from "@/lib/dues-types"

export type FinanceSettingsRow = {
  guild_id: string
  opening_balance: number
  rounding_remainder_balance?: number
  updated_at: string
}

export type LedgerEntryRow = {
  id: string
  guild_id: string
  transaction_date: string
  entry_type: "income" | "expense"
  source_type: string
  source_id: string
  amount: number
  description: string
  cancelled: boolean
  created_at: string
}

export type ExpenseRow = {
  id: string
  guild_id: string
  expense_date: string
  expense_type: string
  amount: number
  target: string
  description: string
  memo: string
  status: "active" | "cancelled"
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ExpenseChangeLogRow = {
  id: string
  expense_id: string
  memo: string
  created_by: string | null
  created_at: string
}

export type DuesRow = {
  id: string
  guild_id: string
  dues_month: string
  amount_per_member: number
  due_date: string
  memo: string
  status: "active" | "closed"
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DueMemberRow = {
  id: string
  due_id: string
  member_id: string
  amount: number
  status: "unpaid" | "payment_reported" | "paid"
  paid_at: string | null
  confirmed_by: string | null
  memo: string
  created_at: string
  updated_at: string
}

export type DueChangeLogRow = {
  id: string
  due_id: string
  member_id: string
  old_status: string
  new_status: string
  memo: string
  created_by: string | null
  created_at: string
}

function toEpoch(iso: string | null): number | null {
  if (!iso) return null
  return new Date(iso).getTime()
}

function mapDbDuesStatusToUi(status: string): DuesPaymentStatus {
  if (status === "paid") return "PAID"
  if (status === "payment_reported") return "PAYMENT_REPORTED"
  return "UNPAID"
}

function uiDuesStatusToDb(status: DuesPaymentStatus): DueMemberRow["status"] {
  if (status === "PAID") return "paid"
  if (status === "PAYMENT_REPORTED") return "payment_reported"
  return "unpaid"
}

function ledgerSourceToClient(sourceType: string): LedgerEntry["sourceType"] {
  if (sourceType === "boss_settlement" || sourceType === "siege_settlement") return "settlement"
  if (sourceType === "dues") return "dues"
  if (sourceType === "expense") return "expense"
  if (sourceType === "manual") return "manual"
  return "legacy"
}

export function ledgerRowToEntry(row: LedgerEntryRow): LedgerEntry {
  const categoryFromDesc = row.description.split(" · ")[0] ?? row.description
  return {
    id: row.id,
    date: row.transaction_date,
    type: row.entry_type === "income" ? "수입" : "지출",
    category: categoryFromDesc,
    memo: row.description,
    amount: Number(row.amount),
    sourceType: ledgerSourceToClient(row.source_type),
    sourceId: row.source_id,
    cancelled: row.cancelled,
  }
}

export function expenseRowToExpense(
  row: ExpenseRow,
  changeLogs: ExpenseChangeLogRow[],
  ledgerEntryId: string | null,
): Expense {
  return {
    id: row.id,
    expenseDate: row.expense_date,
    expenseType: row.expense_type as Expense["expenseType"],
    amount: Number(row.amount),
    target: row.target,
    description: row.description,
    memo: row.memo,
    createdBy: row.created_by ?? "admin",
    createdAt: toEpoch(row.created_at) ?? Date.now(),
    cancelled: row.status === "cancelled",
    ledgerEntryId,
    changeLogs: changeLogs.map((l) => ({
      id: l.id,
      action: "update",
      memo: l.memo,
      changedAt: toEpoch(l.created_at) ?? Date.now(),
      snapshot: l.memo,
    })),
  }
}

export function buildDuesBillsFromRows(
  duesRows: DuesRow[],
  dueMembers: DueMemberRow[],
  changeLogs: DueChangeLogRow[],
  memberNames: Map<string, string>,
): DuesBill[] {
  const membersByDue = new Map<string, DueMemberRow[]>()
  for (const m of dueMembers) {
    const list = membersByDue.get(m.due_id) ?? []
    list.push(m)
    membersByDue.set(m.due_id, list)
  }

  const logsByDue = new Map<string, DueChangeLogRow[]>()
  for (const l of changeLogs) {
    const list = logsByDue.get(l.due_id) ?? []
    list.push(l)
    logsByDue.set(l.due_id, list)
  }

  return duesRows
    .map((d) => {
      const memberRows = membersByDue.get(d.id) ?? []
      const items: DuesBill["items"] = {}
      for (const m of memberRows) {
        items[m.member_id] = {
          memberId: m.member_id,
          nickname: memberNames.get(m.member_id) ?? "혈원",
          status: mapDbDuesStatusToUi(m.status),
          ledgerEntryId: m.status === "paid" ? `${d.id}:${m.member_id}` : null,
        }
      }

      const billLogs: DuesChangeLog[] = (logsByDue.get(d.id) ?? []).map((l) => ({
        id: l.id,
        memberId: l.member_id,
        nickname: memberNames.get(l.member_id) ?? "혈원",
        oldStatus: mapDbDuesStatusToUi(l.old_status),
        newStatus: mapDbDuesStatusToUi(l.new_status),
        memo: l.memo,
        changedAt: toEpoch(l.created_at) ?? Date.now(),
      }))

      return {
        id: d.id,
        yearMonth: d.dues_month,
        title: `${formatYearMonthLabel(d.dues_month)} 혈비`,
        amountPerMember: Number(d.amount_per_member),
        dueDate: d.due_date,
        memo: d.memo,
        createdAt: toEpoch(d.created_at) ?? Date.now(),
        targetMemberIds: memberRows.map((m) => m.member_id),
        items,
        changeLogs: billLogs,
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export { uiDuesStatusToDb, mapDbDuesStatusToUi }

export async function fetchFinanceOperationalData(supabase: SupabaseClient) {
  const [settingsRes, ledgerRes, expensesRes, expenseLogsRes] = await Promise.all([
    supabase.from("guild_finance_settings").select("*").maybeSingle(),
    supabase.from("ledger_entries").select("*").order("transaction_date", { ascending: false }),
    supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
    supabase.from("expense_change_logs").select("*").order("created_at", { ascending: false }),
  ])

  if (settingsRes.error) throw settingsRes.error
  if (ledgerRes.error) throw ledgerRes.error
  if (expensesRes.error) throw expensesRes.error
  if (expenseLogsRes.error) throw expenseLogsRes.error

  const ledgerRows = (ledgerRes.data ?? []) as LedgerEntryRow[]
  const entries = ledgerRows.map(ledgerRowToEntry)

  const logsByExpense = new Map<string, ExpenseChangeLogRow[]>()
  for (const l of (expenseLogsRes.data ?? []) as ExpenseChangeLogRow[]) {
    const list = logsByExpense.get(l.expense_id) ?? []
    list.push(l)
    logsByExpense.set(l.expense_id, list)
  }

  const ledgerByExpenseSource = new Map<string, string>()
  for (const row of ledgerRows) {
    if (row.source_type === "expense" && !row.cancelled) {
      ledgerByExpenseSource.set(row.source_id, row.id)
    }
  }

  const expenses = ((expensesRes.data ?? []) as ExpenseRow[]).map((row) =>
    expenseRowToExpense(row, logsByExpense.get(row.id) ?? [], ledgerByExpenseSource.get(row.id) ?? null),
  )

  const openingBalance = Number((settingsRes.data as FinanceSettingsRow | null)?.opening_balance ?? 0)

  return { openingBalance, entries, expenses }
}

export async function fetchDuesOperationalData(supabase: SupabaseClient) {
  const [duesRes, membersRes, logsRes, namesRes] = await Promise.all([
    supabase.from("dues").select("*").order("created_at", { ascending: false }),
    supabase.from("due_members").select("*"),
    supabase.from("due_change_logs").select("*").order("created_at", { ascending: false }),
    supabase.from("members").select("id, nickname"),
  ])

  if (duesRes.error) throw duesRes.error
  if (membersRes.error) throw membersRes.error
  if (logsRes.error) throw logsRes.error
  if (namesRes.error) throw namesRes.error

  const memberNames = new Map(
    (namesRes.data ?? []).map((m: { id: string; nickname: string }) => [m.id, m.nickname]),
  )

  const bills = buildDuesBillsFromRows(
    (duesRes.data ?? []) as DuesRow[],
    (membersRes.data ?? []) as DueMemberRow[],
    (logsRes.data ?? []) as DueChangeLogRow[],
    memberNames,
  )

  return { bills }
}

export async function upsertLedgerEntry(
  admin: SupabaseClient,
  guildId: string,
  input: {
    transactionDate?: string
    entryType: "income" | "expense"
    sourceType: string
    sourceId: string
    amount: number
    description: string
  },
) {
  const { error } = await admin.from("ledger_entries").upsert(
    {
      guild_id: guildId,
      transaction_date: input.transactionDate ?? getTodayDateString(),
      entry_type: input.entryType,
      source_type: input.sourceType,
      source_id: input.sourceId,
      amount: input.amount,
      description: input.description,
      cancelled: false,
    },
    { onConflict: "guild_id,source_type,source_id,entry_type" },
  )
  if (error) throw error
}

export async function cancelLedgerBySource(
  admin: SupabaseClient,
  guildId: string,
  sourceType: string,
  sourceId: string,
) {
  const { error } = await admin
    .from("ledger_entries")
    .update({ cancelled: true })
    .eq("guild_id", guildId)
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
  if (error) throw error
}
