export const EXPENSE_TYPES = [
  "아지트 세금",
  "버프 계정 비용",
  "버프 세팅 비용",
  "이벤트 비용",
  "기타 운영비",
] as const

export type ExpenseType = (typeof EXPENSE_TYPES)[number]

export type ExpenseChangeLog = {
  id: string
  action: "create" | "update" | "cancel"
  memo: string
  changedAt: number
  snapshot: string
}

export type Expense = {
  id: string
  expenseDate: string
  expenseType: ExpenseType
  amount: number
  target: string
  description: string
  memo: string
  createdBy: string
  createdAt: number
  cancelled: boolean
  ledgerEntryId: string | null
  changeLogs: ExpenseChangeLog[]
}

export type CreateExpenseInput = {
  expenseDate: string
  expenseType: ExpenseType
  amount: number
  target?: string
  description: string
  memo?: string
}

export type UpdateExpenseInput = Partial<
  Pick<Expense, "expenseDate" | "expenseType" | "amount" | "target" | "description" | "memo">
>
