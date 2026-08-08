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
  type DuesBill,
  type DuesPaymentStatus,
  formatYearMonthLabel,
} from "@/lib/dues-types"
import { duesApi, fetchDuesBills } from "@/lib/operations-api"
import { useGuildLedger } from "@/components/guild-ledger-context"

type CreateDuesBillInput = {
  yearMonth: string
  amountPerMember: number
  dueDate: string
  memo?: string
}

type DuesContextValue = {
  bills: DuesBill[]
  activeBillId: string | null
  isLoading: boolean
  loadError: string | null
  refreshDues: () => Promise<void>
  getBill: (billId: string) => DuesBill | undefined
  getPaymentStatus: (memberId: string, billId: string) => DuesPaymentStatus
  isPaid: (memberId: string, billId?: string) => boolean
  getUnpaidBillsForMember: (memberId: string) => DuesBill[]
  getMemberDuesHistory: (memberId: string) => Array<{ bill: DuesBill; status: DuesPaymentStatus }>
  createBill: (input: CreateDuesBillInput) => Promise<{ ok: boolean; message: string; bill?: DuesBill }>
  setPaymentStatus: (
    billId: string,
    memberId: string,
    status: DuesPaymentStatus,
    memo: string,
  ) => Promise<{ ok: boolean; message: string }>
  getBillSummary: (billId: string) => {
    totalTargets: number
    paid: number
    unpaid: number
    reported: number
    totalAssessed: number
    totalCollected: number
    rate: number
  } | null
  getUnpaidCount: (billId?: string) => number
  getPaidCount: (billId?: string) => number
}

const DuesContext = createContext<DuesContextValue | null>(null)

export function DuesProvider({ children }: { children: ReactNode }) {
  const { refreshFinance } = useGuildLedger()
  const [bills, setBills] = useState<DuesBill[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshDues = useCallback(async () => {
    const result = await fetchDuesBills()
    if (!result.ok) {
      setLoadError(result.message ?? "혈비 기록을 불러오지 못했습니다.")
      return
    }
    setLoadError(null)
    setBills(result.bills ?? [])
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setIsLoading(true)
      await refreshDues()
      if (!cancelled) setIsLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshDues])

  const activeBillId = bills[0]?.id ?? null

  const getBill = useCallback(
    (billId: string) => bills.find((b) => b.id === billId),
    [bills],
  )

  const getPaymentStatus = useCallback(
    (memberId: string, billId: string): DuesPaymentStatus => {
      const bill = bills.find((b) => b.id === billId)
      if (!bill) return "UNPAID"
      return bill.items[memberId]?.status ?? "UNPAID"
    },
    [bills],
  )

  const isPaid = useCallback(
    (memberId: string, billId?: string) => {
      const id = billId ?? activeBillId
      if (!id) return true
      return getPaymentStatus(memberId, id) === "PAID"
    },
    [activeBillId, getPaymentStatus],
  )

  const getUnpaidBillsForMember = useCallback(
    (memberId: string) =>
      bills.filter((b) => {
        const item = b.items[memberId]
        if (!item) return false
        return item.status === "UNPAID" || item.status === "PAYMENT_REPORTED"
      }),
    [bills],
  )

  const getMemberDuesHistory = useCallback(
    (memberId: string) =>
      bills
        .filter((b) => b.items[memberId])
        .map((bill) => ({
          bill,
          status: bill.items[memberId]!.status,
        }))
        .sort((a, b) => b.bill.createdAt - a.bill.createdAt),
    [bills],
  )

  const getBillSummary = useCallback(
    (billId: string) => {
      const bill = bills.find((b) => b.id === billId)
      if (!bill) return null
      const items = Object.values(bill.items)
      const paid = items.filter((i) => i.status === "PAID").length
      const reported = items.filter((i) => i.status === "PAYMENT_REPORTED").length
      const unpaid = items.filter((i) => i.status === "UNPAID").length
      const totalTargets = items.length
      const totalAssessed = totalTargets * bill.amountPerMember
      const totalCollected = paid * bill.amountPerMember
      return {
        totalTargets,
        paid,
        unpaid,
        reported,
        totalAssessed,
        totalCollected,
        rate: totalTargets > 0 ? Math.round((paid / totalTargets) * 100) : 0,
      }
    },
    [bills],
  )

  const getUnpaidCount = useCallback(
    (billId?: string) => {
      const id = billId ?? activeBillId
      if (!id) return 0
      const bill = bills.find((b) => b.id === id)
      if (!bill) return 0
      return Object.values(bill.items).filter((i) => i.status === "UNPAID").length
    },
    [bills, activeBillId],
  )

  const getPaidCount = useCallback(
    (billId?: string) => {
      const id = billId ?? activeBillId
      if (!id) return 0
      const bill = bills.find((b) => b.id === id)
      if (!bill) return 0
      return Object.values(bill.items).filter((i) => i.status === "PAID").length
    },
    [bills, activeBillId],
  )

  const createBill = useCallback(
    async (input: CreateDuesBillInput): Promise<{ ok: boolean; message: string; bill?: DuesBill }> => {
      const result = await duesApi.createBill(input)
      if (!result.ok) return result
      const refreshed = await fetchDuesBills()
      if (refreshed.ok) setBills(refreshed.bills ?? [])
      const bill =
        refreshed.bills?.find((b) => b.id === result.billId) ??
        refreshed.bills?.find((b) => b.yearMonth === input.yearMonth)
      return { ...result, bill }
    },
    [],
  )

  const setPaymentStatus = useCallback(
    async (
      billId: string,
      memberId: string,
      status: DuesPaymentStatus,
      memo: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const result = await duesApi.setPaymentStatus(billId, memberId, status, memo)
      if (result.ok) {
        await refreshDues()
        await refreshFinance()
      }
      return result
    },
    [refreshDues, refreshFinance],
  )

  const value = useMemo(
    () => ({
      bills,
      activeBillId,
      isLoading,
      loadError,
      refreshDues,
      getBill,
      getPaymentStatus,
      isPaid,
      getUnpaidBillsForMember,
      getMemberDuesHistory,
      createBill,
      setPaymentStatus,
      getBillSummary,
      getUnpaidCount,
      getPaidCount,
    }),
    [
      bills,
      activeBillId,
      isLoading,
      loadError,
      refreshDues,
      getBill,
      getPaymentStatus,
      isPaid,
      getUnpaidBillsForMember,
      getMemberDuesHistory,
      createBill,
      setPaymentStatus,
      getBillSummary,
      getUnpaidCount,
      getPaidCount,
    ],
  )

  return <DuesContext.Provider value={value}>{children}</DuesContext.Provider>
}

export function useDues() {
  const ctx = useContext(DuesContext)
  if (!ctx) throw new Error("useDues must be used within DuesProvider")
  return ctx
}

export { formatYearMonthLabel }
