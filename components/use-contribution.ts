"use client"

import { useMemo } from "react"
import { useParticipation } from "@/components/participation-context"
import { useSiege } from "@/components/siege-context"
import { useMembers } from "@/components/members-context"
import { useContributionSettings } from "@/components/contribution-settings-context"
import {
  computeMemberContribution,
  computeGuildContributionSummary,
  getThisMonthPeriod,
  getLastMonthPeriod,
  type ContributionPeriod,
  type MemberContributionResult,
} from "@/lib/contribution-utils"

export function useContributionPeriod(period: ContributionPeriod) {
  const { checks } = useParticipation()
  const { sieges } = useSiege()
  const { getActiveMembers } = useMembers()
  const { settings } = useContributionSettings()

  const activeIds = useMemo(
    () => getActiveMembers().map((m) => m.id),
    [getActiveMembers],
  )

  const summary = useMemo(
    () => computeGuildContributionSummary(activeIds, period, checks, sieges, settings),
    [activeIds, period, checks, sieges, settings],
  )

  const getMemberContribution = useMemo(
    () => (memberId: string) => computeMemberContribution(memberId, period, checks, sieges, settings),
    [period, checks, sieges, settings],
  )

  return { summary, getMemberContribution, activeIds }
}

export function useMemberContribution(
  memberId: string,
  period: ContributionPeriod,
): MemberContributionResult {
  const { checks } = useParticipation()
  const { sieges } = useSiege()
  const { settings } = useContributionSettings()

  return useMemo(
    () => computeMemberContribution(memberId, period, checks, sieges, settings),
    [memberId, period, checks, sieges, settings],
  )
}

export {
  getThisMonthPeriod,
  getLastMonthPeriod,
  getAllTimePeriod,
  getYearMonthPeriod,
  type ContributionPeriod,
} from "@/lib/contribution-utils"
