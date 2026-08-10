"use client"

import { Card } from "@/components/ui-bits"
import type { GuildOperationSettings } from "@/lib/operation-settings-types"
import type { SettlementCalcResult } from "@/lib/settlement-utils"
import { formatWon } from "@/lib/guild-data"

type Props = {
  preview: SettlementCalcResult
  participantCount: number
  operationSettings?: GuildOperationSettings | null
}

export function SettlementRoundingPreview({ preview, participantCount, operationSettings }: Props) {
  return (
    <Card className="bg-secondary/50 text-xs text-muted-foreground">
      <p className="mb-1 text-[10px] text-muted-foreground">1,000원 단위로 계산됩니다</p>
      <p>총수익 {formatWon(preview.totalRevenue)}</p>
      {operationSettings?.reserveMode === "percentage" && (
        <p>혈맹 비축 ({operationSettings.reservePercentage}%) {formatWon(preview.guildShareInput)}</p>
      )}
      {operationSettings?.reserveMode === "none" && <p>혈맹 비축 없음</p>}
      {(!operationSettings || operationSettings.reserveMode === "manual_per_settlement") && (
        <p>혈맹 비축(입력) {formatWon(preview.guildShareInput)}</p>
      )}
      {(preview.managementFeeTotal ?? 0) > 0 && (
        <p>관리비 총액 {formatWon(preview.managementFeeTotal ?? 0)}</p>
      )}
      {preview.managementAllocations && preview.managementAllocations.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {preview.managementAllocations.map((a) => (
            <p key={a.memberId}>
              · {a.nickname} {formatWon(a.amount)} ({(a.ratioBp / 100).toFixed(2)}%)
            </p>
          ))}
        </div>
      )}
      <p>분배대상 {formatWon(preview.distributableAmount)}</p>
      <p className="mt-1">
        참여 {participantCount}명 · 1인 {formatWon(preview.perPersonAmount)}
      </p>
      {preview.remainder > 0 && (
        <p className="mt-1">분배 절사 짜투리 {formatWon(preview.remainder)} → 혈맹 귀속</p>
      )}
      <p className="mt-1 font-medium text-foreground">
        혈맹 귀속 합계 {formatWon(preview.guildShareFinal)}
        {" "}(ledger {formatWon(preview.guildShareLedgerAmount)}
        {preview.guildShareSubThousand > 0
          ? ` · carry ${formatWon(preview.guildShareSubThousand)}`
          : ""}
        )
      </p>
    </Card>
  )
}
