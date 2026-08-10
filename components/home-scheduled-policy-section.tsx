"use client"

import { useState } from "react"
import { CalendarClock, ChevronRight } from "lucide-react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { useOperationPolicy } from "@/components/operation-policy-context"
import { OperationPolicyDetailSheet } from "@/components/operation-policy-detail-sheet"
import { formatScheduledEffectiveFromShort } from "@/lib/operation-policy-display-utils"

export function HomeScheduledPolicySection() {
  const { policyView } = useOperationPolicy()
  const [detailOpen, setDetailOpen] = useState(false)

  const next = policyView?.nextScheduledPolicy
  if (!next || !policyView) return null

  const changeLines = policyView.nextScheduledChangeLines

  return (
    <div className="mb-4">
      <SectionTitle>운영 정책 변경 예정</SectionTitle>

      <Card className="overflow-hidden border-primary/25 bg-gradient-to-br from-primary/8 via-card to-card p-0">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {formatScheduledEffectiveFromShort(next.effectiveFrom)}
              </p>
              {changeLines.length > 0 ? (
                <ul className="mt-2 space-y-1">
                  {changeLines.map((line) => (
                    <li key={line} className="text-xs text-muted-foreground">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : (
                next.sections[0]?.lines.slice(0, 2).map((line) => (
                  <p key={line} className="mt-1 text-xs text-muted-foreground">
                    {line}
                  </p>
                ))
              )}
              {next.changeReason && (
                <p className="mt-2 text-[11px] text-muted-foreground">{next.changeReason}</p>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDetailOpen(true)}
          className="flex w-full items-center justify-center gap-1 border-t border-border/60 bg-secondary/30 py-2.5 text-xs font-semibold text-primary transition-colors hover:bg-secondary/60"
        >
          {policyView.additionalScheduledCount > 0
            ? `예정된 정책 ${policyView.additionalScheduledCount + 1}건 · 변경 내용 자세히 보기`
            : "변경 내용 자세히 보기"}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </Card>

      <OperationPolicyDetailSheet
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        policyView={policyView}
      />
    </div>
  )
}
