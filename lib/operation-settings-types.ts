export type PolicyAmountMode = "none" | "percentage" | "manual_per_settlement"

export const POLICY_AMOUNT_MODES: PolicyAmountMode[] = [
  "none",
  "percentage",
  "manual_per_settlement",
]

export const POLICY_AMOUNT_MODE_LABELS: Record<PolicyAmountMode, string> = {
  none: "없음",
  percentage: "수익의 일정 비율",
  manual_per_settlement: "건별 직접 입력",
}

export const RESERVE_MODE_LABELS: Record<PolicyAmountMode, string> = {
  none: "없음",
  percentage: "수익의 일정 비율",
  manual_per_settlement: "정산마다 직접 입력",
}

export type ManagementFeeAllocation = {
  memberId: string
  nickname: string
  ratioBp: number
  amount: number
}

export type GuildOperationSettings = {
  managementFeeMode: PolicyAmountMode
  managementFeePercentage: number | null
  reserveMode: PolicyAmountMode
  reservePercentage: number | null
  allocations: Array<{
    memberId: string
    nickname: string
    ratioBp: number
  }>
  updatedAt: string | null
}

export type OperationPolicySnapshot = {
  reserveMode: PolicyAmountMode
  reservePercentage: number | null
  reserveManualInput: number
  managementFeeMode: PolicyAmountMode
  managementFeePercentage: number | null
  managementFeeManualInput: number
  managementFeeTotal: number
  managementAllocations: ManagementFeeAllocation[]
}

export type GuildOperationSettingLog = {
  id: string
  previousSnapshot: Record<string, unknown>
  newSnapshot: Record<string, unknown>
  reason: string
  createdBy: string | null
  createdAt: string
}

export type ActiveMemberOption = {
  id: string
  nickname: string
  role: string
  position: string
}

export const RATIO_BP_TOTAL = 10_000
