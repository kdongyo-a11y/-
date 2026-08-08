"use client"

import { useState } from "react"
import { ClipboardList } from "lucide-react"
import { useSiege, type SurveyResponse } from "@/components/siege-context"
import { formatSiegeTimeRange } from "@/lib/siege-utils"
import { useCurrentMemberId } from "@/components/auth-context"
import { cn } from "@/lib/utils"

export function SiegeSurveyCard({ embedded }: { embedded?: boolean }) {
  const { getActiveSurveySiege, needsSurveyResponse, submitSurveyResponse } = useSiege()
  const memberId = useCurrentMemberId()
  const siege = getActiveSurveySiege()
  const [feedback, setFeedback] = useState<string | null>(null)

  if (!siege) return null
  if (!needsSurveyResponse(siege.id, memberId)) return null

  const timeRange = formatSiegeTimeRange(siege.startTime, siege.endTime)

  function handleSelect(response: SurveyResponse) {
    void (async () => {
      const result = await submitSurveyResponse(siege!.id, response)
      setFeedback(result.message)
    })()
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/10 to-card",
        !embedded && "mb-4",
      )}
    >
      <div className="flex items-center justify-between border-b border-primary/15 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-primary">
          <ClipboardList className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">이번 주 공성 참여조사</span>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
          {timeRange}
        </span>
      </div>

      <div className="p-4">
        <p className="text-sm font-semibold text-foreground">
          이번 주 공성 참여 여부를 알려주세요
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          일요일 {timeRange} · {siege.eventDate}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSelect("참여 예정")}
            className="rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            참여 예정
          </button>
          <button
            type="button"
            onClick={() => handleSelect("불참 예정")}
            className="rounded-xl border border-border bg-secondary py-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            불참 예정
          </button>
        </div>

        {feedback && (
          <p className="mt-2 text-center text-xs font-medium text-success">{feedback}</p>
        )}
      </div>
    </div>
  )
}
