"use client"

import { Shield } from "lucide-react"
import { Card, Badge } from "@/components/ui-bits"
import { HomePendingSection } from "@/components/home-pending-section"
import { HomeUpcomingBossSection } from "@/components/home-upcoming-boss-section"
import { HomeMyStatsSection } from "@/components/home-my-stats-section"
import { useParticipation } from "@/components/participation-context"
import { useSiege } from "@/components/siege-context"
import { useDues } from "@/components/dues-context"
import { useCurrentMemberId } from "@/components/auth-context"
import { useMembers } from "@/components/members-context"
import { useSettlement } from "@/components/settlement-context"
import { useMemberContribution, getThisMonthPeriod } from "@/components/use-contribution"
import { formatSiegeTimeRange } from "@/lib/siege-utils"
import { formatMemberProfile } from "@/lib/member-utils"
import { cn } from "@/lib/utils"

export function HomeScreen() {
  const { getThisWeekSiege, getActiveSurveySiege, getMemberSurveyStatus, submitSurveyResponse } =
    useSiege()
  const { isPaid, bills, activeBillId } = useDues()

  const memberId = useCurrentMemberId()
  const { getMember } = useMembers()
  const user = getMember(memberId)
  const period = getThisMonthPeriod()
  const contribution = useMemberContribution(memberId, period)
  const { getMemberReceivedPayoutTotal } = useSettlement()

  const activeBill = bills.find((b) => b.id === activeBillId)
  const duesPaid = activeBillId ? isPaid(memberId, activeBillId) : true
  const contributionTotal = contribution.breakdown.total
  const totalPayout = getMemberReceivedPayoutTotal(memberId)
  const monthBossCount =
    contribution.breakdown.generalCount + contribution.breakdown.mainCount

  const thisWeekSiege = getThisWeekSiege()
  const activeSurvey = getActiveSurveySiege()
  const surveyStatus = thisWeekSiege
    ? getMemberSurveyStatus(thisWeekSiege.id, memberId)
    : null
  const showSiegeSurveyStatus =
    thisWeekSiege &&
    thisWeekSiege.status === "survey_open" &&
    surveyStatus &&
    surveyStatus !== "미응답"
  const showSiegeDraftNotice =
    thisWeekSiege &&
    thisWeekSiege.status === "draft" &&
    !activeSurvey

  const duesStatusLabel = activeBill
    ? `${activeBill.title.replace(/ 혈비$/, "")}`
    : undefined

  return (
    <div>
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">환영합니다,</p>
        <p className="text-xl font-semibold text-foreground">
          {user?.nickname ?? "혈원"}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {user ? formatMemberProfile(user) : ""}
          </span>
        </p>
      </div>

      <HomePendingSection />

      <HomeUpcomingBossSection />

      {showSiegeSurveyStatus && thisWeekSiege && (
        <Card className="mb-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">이번 주 공성</p>
              <p className="text-xs text-muted-foreground">
                일요일 {formatSiegeTimeRange(thisWeekSiege.startTime, thisWeekSiege.endTime)}
              </p>
            </div>
            <Badge tone={surveyStatus === "참여 예정" ? "success" : "neutral"}>{surveyStatus}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void submitSurveyResponse(thisWeekSiege.id, "참여 예정")}
              className={cn(
                "rounded-lg py-2 text-xs font-semibold transition-colors",
                surveyStatus === "참여 예정"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-secondary text-muted-foreground",
              )}
            >
              참여 예정
            </button>
            <button
              type="button"
              onClick={() => void submitSurveyResponse(thisWeekSiege.id, "불참 예정")}
              className={cn(
                "rounded-lg py-2 text-xs font-semibold transition-colors",
                surveyStatus === "불참 예정"
                  ? "bg-secondary text-foreground ring-1 ring-border"
                  : "border border-border bg-secondary text-muted-foreground",
              )}
            >
              불참 예정
            </button>
          </div>
        </Card>
      )}

      {showSiegeDraftNotice && thisWeekSiege && (
        <Card className="mb-4 border-primary/25 bg-gradient-to-br from-primary/10 to-card">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Shield className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-primary">이번 주 공성</p>
              <p className="mt-0.5 text-sm font-semibold text-foreground">
                일요일 {formatSiegeTimeRange(thisWeekSiege.startTime, thisWeekSiege.endTime)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">참여조사 시작 전</p>
            </div>
          </div>
        </Card>
      )}

      <HomeMyStatsSection
        periodLabel={period.label}
        monthBossCount={monthBossCount}
        contributionTotal={contributionTotal}
        totalPayout={totalPayout}
        duesPaid={duesPaid}
        duesLabel={duesStatusLabel}
      />
    </div>
  )
}
