export type SettlementCalcInput = {
  totalRevenue: number
  guildShareInput: number
  participantCount: number
}

export type SettlementCalcResult = {
  distributableAmount: number
  perPersonAmount: number
  remainder: number
  guildShareFinal: number
  totalDistributed: number
}

export function calcSettlement({
  totalRevenue,
  guildShareInput,
  participantCount,
}: SettlementCalcInput): SettlementCalcResult {
  const distributableAmount = Math.max(0, totalRevenue - guildShareInput)
  const perPersonAmount =
    participantCount > 0 ? Math.floor(distributableAmount / participantCount) : 0
  const totalDistributed = perPersonAmount * participantCount
  const remainder = distributableAmount - totalDistributed
  const guildShareFinal = guildShareInput + remainder

  return {
    distributableAmount,
    perPersonAmount,
    remainder,
    guildShareFinal,
    totalDistributed,
  }
}

export function isSettlementComplete(adminPaid: boolean, memberReceived: boolean): boolean {
  return adminPaid && memberReceived
}
