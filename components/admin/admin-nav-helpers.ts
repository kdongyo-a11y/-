import type { AdminNavState } from "@/components/admin/admin-types"

export function bossDateNav(date: string): AdminNavState {
  return { section: "boss", bossDate: date }
}

export function bossSlotNav(date: string, slotId: string): AdminNavState {
  return { section: "boss", bossDate: date, bossSlotId: slotId }
}

export function siegeDetailNav(siegeId: string): AdminNavState {
  return { section: "siege", siegeId }
}

export function memberDetailNav(memberId: string): AdminNavState {
  return { section: "members", memberId }
}

export function financeTabNav(tab: AdminNavState["financeTab"]): AdminNavState {
  return { section: "finance", financeTab: tab ?? "status" }
}

export function duesBillNav(billId: string): AdminNavState {
  return { section: "finance", financeTab: "dues", duesBillId: billId }
}

export function contributionMemberNav(memberId: string): AdminNavState {
  return { section: "contribution", contributionMemberId: memberId }
}

export function initialDataNav(tab?: AdminNavState["initialDataTab"]): AdminNavState {
  return { section: "initialData", initialDataTab: tab }
}

export function initialDataTabNav(tab: NonNullable<AdminNavState["initialDataTab"]>): AdminNavState {
  return { section: "initialData", initialDataTab: tab }
}

export function dataManagementNav(tab?: AdminNavState["dataManagementTab"]): AdminNavState {
  return { section: "dataManagement", dataManagementTab: tab }
}

export function dataManagementTabNav(tab: NonNullable<AdminNavState["dataManagementTab"]>): AdminNavState {
  return { section: "dataManagement", dataManagementTab: tab }
}

export function noticesNav(): AdminNavState {
  return { section: "notices" }
}

export function shiftDate(dateStr: string, deltaDays: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}

export function formatDateLabel(dateStr: string): string {
  const today = new Date().toISOString().slice(0, 10)
  if (dateStr === today) return "오늘"
  return dateStr
}
