export type AdminSection =
  | "home"
  | "boss"
  | "siege"
  | "members"
  | "finance"
  | "contribution"
  | "notices"
  | "initialData"
  | "dataManagement"

export type FinanceTab = "status" | "settlements" | "dues" | "expenses"

export type InitialDataTab =
  | "guild_profile"
  | "opening_balance"
  | "cash_checkpoint"
  | "bulk_members"
  | "contribution_scores"
  | "operation_policy"

export type DataManagementTab = "dashboard" | "aggregates" | "export"

export type AdminNavState = {
  section: AdminSection
  bossDate?: string
  bossSlotId?: string
  siegeId?: string
  memberId?: string
  financeTab?: FinanceTab
  duesBillId?: string
  contributionMemberId?: string
  initialDataTab?: InitialDataTab
  dataManagementTab?: DataManagementTab
}

export const ADMIN_HOME: AdminNavState = { section: "home" }
