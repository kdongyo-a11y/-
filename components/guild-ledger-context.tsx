"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import {
  type Expense,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from "@/lib/expense-types"
import { fetchFinanceData, financeApi } from "@/lib/operations-api"
import {
  computeCumulativeGuildContributions,
  computeGuildFundFromLedger,
  computeMonthGuildExpense,
  computeMonthGuildIncome,
  type GuildFundLedgerEntry,
} from "@/lib/guild-fund-utils"

export type LedgerSourceType = "settlement" | "dues" | "expense" | "manual" | "legacy"

export type LedgerEntry = {
  id: string
  date: string
  type: "수입" | "지출"
  category: string
  memo: string
  amount: number
  sourceType: LedgerSourceType
  sourceId: string
  cancelled: boolean
}

/** DB guild_finance_settings.opening_balance — 미설정 시 0 */
export const OPENING_BALANCE = 0

type GuildLedgerContextValue = {
  openingBalance: number
  guildFund: number
  cumulativeGuildContributions: number
  entries: LedgerEntry[]
  expenses: Expense[]
  isLoading: boolean
  loadError: string | null
  refreshFinance: () => Promise<void>
  addSettlementLedgerEntries: (params: {
    label: string
    category?: string
    totalRevenue: number
    totalDistributed: number
    guildShareFinal: number
    settlementKey: string
  }) => void
  postDuesIncome: (params: {
    memberId: string
    nickname: string
    billId: string
    amount: number
    paymentEntryId: string
  }) => string
  reverseDuesIncome: (ledgerEntryId: string) => void
  postSettlementReturn: (params: {
    settlementKey: string
    memberId: string
    nickname: string
    amount: number
    label: string
  }) => string | null
  postSettlementAdditionalPayout: (params: {
    settlementKey: string
    memberId: string
    nickname: string
    amount: number
    label: string
  }) => string | null
  addExpense: (input: CreateExpenseInput, createdBy?: string) => Promise<{ ok: boolean; message: string; expense?: Expense }>
  updateExpense: (
    expenseId: string,
    input: UpdateExpenseInput,
    memo: string,
  ) => Promise<{ ok: boolean; message: string }>
  cancelExpense: (expenseId: string, memo: string) => Promise<{ ok: boolean; message: string }>
  getActiveEntries: () => LedgerEntry[]
  getMonthGuildIncome: (yearMonth: string) => number
  getMonthGuildExpense: (yearMonth: string) => number
  getMonthExpenseTotal: (yearMonth: string) => number
  getMonthExpenseCount: (yearMonth: string) => number
}

const GuildLedgerContext = createContext<GuildLedgerContextValue | null>(null)

function toGuildFundEntries(entries: LedgerEntry[]): GuildFundLedgerEntry[] {
  return entries.map((e) => ({
    date: e.date,
    type: e.type,
    amount: e.amount,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    cancelled: e.cancelled,
  }))
}

export function GuildLedgerProvider({ children }: { children: ReactNode }) {
  const [openingBalance, setOpeningBalance] = useState(OPENING_BALANCE)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshFinance = useCallback(async () => {
    const result = await fetchFinanceData()
    if (!result.ok) {
      setLoadError(result.message ?? "재정 기록을 불러오지 못했습니다.")
      return
    }
    setLoadError(null)
    setOpeningBalance(result.openingBalance ?? OPENING_BALANCE)
    setEntries(result.entries ?? [])
    setExpenses(result.expenses ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      await refreshFinance()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshFinance])

  const guildFund = useMemo(
    () => computeGuildFundFromLedger(openingBalance, toGuildFundEntries(entries)),
    [openingBalance, entries],
  )

  const cumulativeGuildContributions = useMemo(
    () => computeCumulativeGuildContributions(toGuildFundEntries(entries)),
    [entries],
  )

  const getActiveEntries = useCallback(
    () => entries.filter((e) => !e.cancelled),
    [entries],
  )

  const addSettlementLedgerEntries = useCallback(() => {
    void refreshFinance()
  }, [refreshFinance])

  const postDuesIncome = useCallback(() => {
    void refreshFinance()
    return ""
  }, [refreshFinance])

  const reverseDuesIncome = useCallback(() => {
    void refreshFinance()
  }, [refreshFinance])

  const postSettlementReturn = useCallback(() => {
    void refreshFinance()
    return null
  }, [refreshFinance])

  const postSettlementAdditionalPayout = useCallback(() => {
    void refreshFinance()
    return null
  }, [refreshFinance])

  const addExpense = useCallback(
    async (input: CreateExpenseInput, _createdBy?: string) => {
      const result = await financeApi.addExpense(input)
      if (result.ok) await refreshFinance()
      return result
    },
    [refreshFinance],
  )

  const updateExpense = useCallback(
    async (expenseId: string, input: UpdateExpenseInput, memo: string) => {
      const result = await financeApi.updateExpense(expenseId, input, memo)
      if (result.ok) await refreshFinance()
      return result
    },
    [refreshFinance],
  )

  const cancelExpense = useCallback(
    async (expenseId: string, memo: string) => {
      const result = await financeApi.cancelExpense(expenseId, memo)
      if (result.ok) await refreshFinance()
      return result
    },
    [refreshFinance],
  )

  const getMonthGuildIncome = useCallback(
    (yearMonth: string) => computeMonthGuildIncome(toGuildFundEntries(entries), yearMonth),
    [entries],
  )

  const getMonthGuildExpense = useCallback(
    (yearMonth: string) => computeMonthGuildExpense(toGuildFundEntries(entries), yearMonth),
    [entries],
  )

  const getMonthExpenseTotal = useCallback(
    (yearMonth: string) =>
      expenses
        .filter((e) => !e.cancelled && e.expenseDate.startsWith(yearMonth))
        .reduce((sum, e) => sum + e.amount, 0),
    [expenses],
  )

  const getMonthExpenseCount = useCallback(
    (yearMonth: string) =>
      expenses.filter((e) => !e.cancelled && e.expenseDate.startsWith(yearMonth)).length,
    [expenses],
  )

  const value = useMemo(
    () => ({
      openingBalance,
      guildFund,
      cumulativeGuildContributions,
      entries,
      expenses,
      isLoading,
      loadError,
      refreshFinance,
      addSettlementLedgerEntries,
      postDuesIncome,
      reverseDuesIncome,
      postSettlementReturn,
      postSettlementAdditionalPayout,
      addExpense,
      updateExpense,
      cancelExpense,
      getActiveEntries,
      getMonthGuildIncome,
      getMonthGuildExpense,
      getMonthExpenseTotal,
      getMonthExpenseCount,
    }),
    [
      openingBalance,
      guildFund,
      cumulativeGuildContributions,
      entries,
      expenses,
      isLoading,
      loadError,
      refreshFinance,
      addSettlementLedgerEntries,
      postDuesIncome,
      reverseDuesIncome,
      postSettlementReturn,
      postSettlementAdditionalPayout,
      addExpense,
      updateExpense,
      cancelExpense,
      getActiveEntries,
      getMonthGuildIncome,
      getMonthGuildExpense,
      getMonthExpenseTotal,
      getMonthExpenseCount,
    ],
  )

  return <GuildLedgerContext.Provider value={value}>{children}</GuildLedgerContext.Provider>
}

export function useGuildLedger() {
  const ctx = useContext(GuildLedgerContext)
  if (!ctx) throw new Error("useGuildLedger must be used within GuildLedgerProvider")
  return ctx
}

export type { Expense }
