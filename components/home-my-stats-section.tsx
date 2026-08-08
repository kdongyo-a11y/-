"use client"

import { Swords, Wallet } from "lucide-react"
import { SectionTitle, Card } from "@/components/ui-bits"
import { formatWon, formatWonShort } from "@/lib/guild-data"
import { formatContributionPoints } from "@/lib/boss-time-slots"
import { cn } from "@/lib/utils"

type HomeMyStatsProps = {
  periodLabel: string
  monthBossCount: number
  contributionTotal: number
  totalPayout: number
  duesPaid: boolean
  duesLabel?: string
}

export function HomeMyStatsSection({
  periodLabel,
  monthBossCount,
  contributionTotal,
  totalPayout,
  duesPaid,
  duesLabel,
}: HomeMyStatsProps) {
  return (
    <div className="mb-2">
      <SectionTitle>내 현황</SectionTitle>
      <Card className="divide-y divide-border p-0">
        <StatRow
          icon={<Swords className="h-3.5 w-3.5 text-primary" />}
          label="이번 달 보스 참여"
          value={`${monthBossCount}회`}
          sub={periodLabel}
        />
        <StatRow
          icon={<Swords className="h-3.5 w-3.5 text-primary" />}
          label="이번 달 기여도"
          value={formatContributionPoints(contributionTotal)}
          highlight
        />
        <StatRow
          icon={<Wallet className="h-3.5 w-3.5 text-success" />}
          label="누적 분배금"
          value={`${formatWonShort(totalPayout)}원`}
          sub={formatWon(totalPayout)}
        />
        {duesPaid && duesLabel && (
          <StatRow label={duesLabel} value="납부 완료" tone="success" compact />
        )}
      </Card>
    </div>
  )
}

function StatRow({
  icon,
  label,
  value,
  sub,
  highlight,
  tone,
  compact,
}: {
  icon?: React.ReactNode
  label: string
  value: string
  sub?: string
  highlight?: boolean
  tone?: "success"
  compact?: boolean
}) {
  return (
    <div className={cn("flex items-center justify-between px-4", compact ? "py-2.5" : "py-3")}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="text-right">
        <p
          className={cn(
            "text-sm font-semibold tabular-nums",
            highlight && "text-primary",
            tone === "success" && "text-success",
            !highlight && tone !== "success" && "text-foreground",
          )}
        >
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
      </div>
    </div>
  )
}
