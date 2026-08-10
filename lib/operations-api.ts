import type { SlotAdminFlags } from "@/lib/boss-admin-status"
import type { SlotCheck } from "@/components/participation-context"
import type { SiegeEvent } from "@/components/siege-context"

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return (await res.json()) as T
}

export async function fetchBossEvents(): Promise<{
  ok: boolean
  checks?: Record<string, SlotCheck>
  slotAdminFlags?: Record<string, SlotAdminFlags>
  message?: string
}> {
  const res = await fetch("/api/boss/events")
  return res.json()
}

export async function fetchSiegeEvents(): Promise<{
  ok: boolean
  sieges?: SiegeEvent[]
  message?: string
}> {
  const res = await fetch("/api/siege/events")
  return res.json()
}

export const bossApi = {
  startCheck: (slotId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/boss/check/start", { slotId }),
  closeCheck: (slotId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/boss/check/close", { slotId }),
  regenerateCode: (slotId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/boss/check/regenerate-code", { slotId }),
  joinByCode: (code: string) =>
    postJson<{ ok: boolean; message: string }>("/api/boss/participations/join", { code }),
  manualParticipation: (input: {
    slotId: string
    memberId: string
    memo: string
    action: "add" | "remove"
  }) => postJson<{ ok: boolean; message: string }>("/api/boss/participations/manual", input),
  updateEvent: (input: {
    slotId: string
    action: "extra_bosses" | "no_income" | "declare_income" | "cancel_no_income"
    extraMainBosses?: string[]
  }) => postJson<{ ok: boolean; message: string }>("/api/boss/events/update", input),
}

export const siegeApi = {
  mutate: (body: Record<string, unknown>) =>
    postJson<{ ok: boolean; message: string }>("/api/siege/mutate", body),
}

export async function fetchSettlements(): Promise<{
  ok: boolean
  settlements?: Record<string, import("@/lib/settlement-types").Settlement>
  message?: string
}> {
  const res = await fetch("/api/settlements")
  return res.json()
}

export const settlementApi = {
  createBoss: (
    slotId: string,
    totalRevenue: number,
    guildShareInput: number,
    managementFeeManualInput = 0,
    revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "create_boss",
      slotId,
      totalRevenue,
      guildShareInput,
      managementFeeManualInput,
      revenueItems,
    }),
  createSiege: (
    siegeId: string,
    totalRevenue: number,
    guildShareInput: number,
    memo?: string,
    managementFeeManualInput = 0,
    revenueItems?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemInput[],
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "create_siege",
      siegeId,
      totalRevenue,
      guildShareInput,
      memo,
      managementFeeManualInput,
      revenueItems,
    }),
  revise: (
    sourceType: "boss" | "siege",
    sourceId: string,
    attendees: Array<{ memberId: string; name: string }>,
    reason: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "revise",
      sourceType,
      sourceId,
      attendees,
      reason,
    }),
  confirmAdminPayment: (sourceType: "boss" | "siege", sourceId: string, memberId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_admin_payment",
      sourceType,
      sourceId,
      memberId,
    }),
  confirmAllAdminPayments: (sourceType: "boss" | "siege", sourceId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_all_admin_payments",
      sourceType,
      sourceId,
    }),
  confirmMemberReceipt: (sourceType: "boss" | "siege", sourceId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_member_receipt",
      sourceType,
      sourceId,
    }),
  confirmMemberReturn: (sourceType: "boss" | "siege", sourceId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_member_return",
      sourceType,
      sourceId,
    }),
  confirmAdminReturn: (sourceType: "boss" | "siege", sourceId: string, memberId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_admin_return",
      sourceType,
      sourceId,
      memberId,
    }),
  confirmAdditionalAdminPayment: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_additional_admin_payment",
      sourceType,
      sourceId,
      memberId,
    }),
  cancelAdminReturnConfirmation: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "cancel_admin_return_confirmation",
      sourceType,
      sourceId,
      memberId,
    }),
  cancelAdminPaymentConfirmation: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "cancel_admin_payment_confirmation",
      sourceType,
      sourceId,
      memberId,
    }),
  cancelAdditionalAdminPaymentConfirmation: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "cancel_additional_admin_payment_confirmation",
      sourceType,
      sourceId,
      memberId,
    }),
  adminModifyStatus: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
    field: "adminPaid" | "memberReceived",
    value: boolean,
    reason: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "admin_modify_status",
      sourceType,
      sourceId,
      memberId,
      field,
      value,
      reason,
    }),
  confirmManagementAdminPayment: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_management_admin_payment",
      sourceType,
      sourceId,
      memberId,
    }),
  cancelManagementAdminPayment: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
    reason?: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "cancel_management_admin_payment",
      sourceType,
      sourceId,
      memberId,
      reason,
    }),
  confirmManagementMemberReceipt: (sourceType: "boss" | "siege", sourceId: string) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "confirm_management_member_receipt",
      sourceType,
      sourceId,
    }),
  updateManagementPaymentMemo: (
    sourceType: "boss" | "siege",
    sourceId: string,
    memberId: string,
    memo: string,
    reason?: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/settlements/mutate", {
      action: "update_management_payment_memo",
      sourceType,
      sourceId,
      memberId,
      memo,
      reason,
    }),
}

export async function fetchFinanceData(): Promise<{
  ok: boolean
  openingBalance?: number
  entries?: import("@/components/guild-ledger-context").LedgerEntry[]
  expenses?: import("@/lib/expense-types").Expense[]
  message?: string
}> {
  const res = await fetch("/api/finance")
  return res.json()
}

export const financeApi = {
  addExpense: (input: import("@/lib/expense-types").CreateExpenseInput) =>
    postJson<{ ok: boolean; message: string; expenseId?: string }>("/api/finance/mutate", {
      action: "add_expense",
      input,
    }),
  updateExpense: (
    expenseId: string,
    input: import("@/lib/expense-types").UpdateExpenseInput,
    memo: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/finance/mutate", {
      action: "update_expense",
      expenseId,
      input,
      memo,
    }),
  cancelExpense: (expenseId: string, memo: string) =>
    postJson<{ ok: boolean; message: string }>("/api/finance/mutate", {
      action: "cancel_expense",
      expenseId,
      memo,
    }),
}

export async function fetchFinanceSummary(): Promise<{
  ok: boolean
  summary?: import("@/lib/finance-summary-types").FinanceSummary
  message?: string
}> {
  const res = await fetch("/api/finance/summary")
  return res.json()
}

export async function fetchCashCheckpoints(): Promise<{
  ok: boolean
  checkpoints?: import("@/lib/guild-cash-types").GuildCashCheckpoint[]
  message?: string
}> {
  const res = await fetch("/api/finance/cash-checkpoint")
  return res.json()
}

export async function createCashCheckpoint(input: {
  effectiveAt: string
  openingCashBalance: number
  memo: string
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/api/finance/cash-checkpoint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create_checkpoint", ...input }),
  })
  return res.json()
}

export async function confirmRevenueReceipt(input: {
  sourceType: "boss" | "siege"
  sourceId: string
  amount: number
  memo?: string
  receivedAt?: string
}): Promise<{ ok: boolean; message: string }> {
  const res = await fetch("/api/finance/revenue-receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "confirm_receipt", ...input }),
  })
  return res.json()
}

export async function updateSettlementRevenueItems(input: {
  sourceType: "boss" | "siege"
  sourceId: string
  action?: "update_metadata" | "update_amounts"
  updates?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItemUpdateInput[]
  amountItems?: Array<{ id: string; amount: number }>
}): Promise<{
  ok: boolean
  message: string
  items?: import("@/lib/settlement-revenue-item-types").SettlementRevenueItem[]
}> {
  const res = await fetch("/api/finance/revenue-items/mutate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: input.action ?? "update_items",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      updates: input.updates,
      amountItems: input.amountItems,
    }),
  })
  return res.json()
}

export async function fetchDuesBills(): Promise<{
  ok: boolean
  bills?: import("@/lib/dues-types").DuesBill[]
  message?: string
}> {
  const res = await fetch("/api/dues")
  return res.json()
}

export const duesApi = {
  createBill: (input: {
    yearMonth: string
    amountPerMember: number
    dueDate: string
    memo?: string
  }) =>
    postJson<{ ok: boolean; message: string; billId?: string }>("/api/dues/mutate", {
      action: "create_bill",
      ...input,
    }),
  setPaymentStatus: (
    billId: string,
    memberId: string,
    status: import("@/lib/dues-types").DuesPaymentStatus,
    changeMemo: string,
  ) =>
    postJson<{ ok: boolean; message: string }>("/api/dues/mutate", {
      action: "set_payment_status",
      billId,
      memberId,
      status,
      changeMemo,
    }),
}
