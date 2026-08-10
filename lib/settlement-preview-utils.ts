import type { GuildOperationSettings } from "@/lib/operation-settings-types"
import { calcSettlementWithPolicy } from "@/lib/operation-settings-utils"
import { calcSettlement, type SettlementCalcResult } from "@/lib/settlement-utils"

export function calcSettlementPreview(input: {
  totalRevenue: number
  participantCount: number
  reserveManualInput: number
  managementFeeManualInput: number
  operationSettings: GuildOperationSettings | null
}): SettlementCalcResult {
  const settings = input.operationSettings
  if (!settings) {
    return calcSettlement({
      totalRevenue: input.totalRevenue,
      guildShareInput: input.reserveManualInput,
      participantCount: input.participantCount,
    })
  }

  return calcSettlementWithPolicy({
    totalRevenue: input.totalRevenue,
    participantCount: input.participantCount,
    reserveMode: settings.reserveMode,
    reservePercentage: settings.reservePercentage,
    reserveManualInput:
      settings.reserveMode === "manual_per_settlement" ? input.reserveManualInput : 0,
    managementFeeMode: settings.managementFeeMode,
    managementFeePercentage: settings.managementFeePercentage,
    managementFeeManualInput:
      settings.managementFeeMode === "manual_per_settlement"
        ? input.managementFeeManualInput
        : 0,
    allocations: settings.allocations,
  })
}
