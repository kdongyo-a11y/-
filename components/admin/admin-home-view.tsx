"use client"

import { useMemo } from "react"
import { ChevronRight, Clock, Shield, Users, Coins, Trophy, Database, FolderOpen } from "lucide-react"
import { Card, SectionTitle } from "@/components/ui-bits"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useAuth } from "@/components/auth-context"
import { useParticipation } from "@/components/participation-context"
import { useSettlement, isSettlementComplete } from "@/components/settlement-context"
import { useSiege } from "@/components/siege-context"
import { useDues } from "@/components/dues-context"
import { useGuildLedger } from "@/components/guild-ledger-context"
import { useMembers } from "@/components/members-context"
import { getTodayDateString, generateDaySlots } from "@/lib/boss-time-slots"
import {
  computeBossProcessStatus,
  summarizeBossStatuses,
} from "@/lib/boss-admin-status"
import { bossDateNav, financeTabNav, initialDataNav, dataManagementNav } from "@/components/admin/admin-nav-helpers"
import { useContributionPeriod, getThisMonthPeriod } from "@/components/use-contribution"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminHomeView({ onNavigate }: Props) {
  const { canManageRoles } = useAuth()
  const today = getTodayDateString()
  const { getCheck, getSlotAdminFlags, checks, slotAdminFlags } = useParticipation()
  const { getBossSettlement, settlements } = useSettlement()
  const { sieges, getSurveyStats } = useSiege()
  const { getUnpaidCount, activeBillId } = useDues()
  const { getMonthExpenseCount } = useGuildLedger()
  const { getStats, getMember } = useMembers()
  const memberStats = getStats()
  const period = getThisMonthPeriod()
  const { summary: contributionSummary } = useContributionPeriod(period)

  const bossSummary = useMemo(() => {
    const statuses = generateDaySlots(today).map((slot) => {
      const check = getCheck(slot.id)
      const settlement = getBossSettlement(slot.id)
      const flags = getSlotAdminFlags(slot.id)
      return computeBossProcessStatus({
        checkStatus: check.status,
        flags,
        hasSettlement: !!settlement,
        settlementParticipants: settlement?.participants ?? [],
      })
    })
    return summarizeBossStatuses(statuses)
  }, [today, getCheck, getBossSettlement, getSlotAdminFlags, checks, slotAdminFlags, settlements])

  const siegeCard = useMemo(() => {
    const siege = sieges[sieges.length - 1]
    if (!siege) return null
    const stats = getSurveyStats(siege.id)
    return { siege, stats, inSurvey: siege.status === "survey_open" }
  }, [sieges, getSurveyStats])

  const incompleteSettlements = useMemo(() => {
    return Object.values(settlements).filter((s) => {
      if (s.participants.length === 0) return false
      return !s.participants.every((p) => isSettlementComplete(p.adminPaid, p.memberReceived))
    }).length
  }, [settlements])

  const monthExpenses = getMonthExpenseCount(today.slice(0, 7))
  const unpaidDues = activeBillId ? getUnpaidCount(activeBillId) : 0
  const topContributor = contributionSummary.top

  return (
    <div>
      <SectionTitle>관리자 홈</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        관리 영역을 선택하세요. 상세 기능은 각 메뉴 안에서 확인합니다.
      </p>

      <div className="flex flex-col gap-3">
        <CategoryCard
          icon={<Clock className="h-4 w-4" />}
          title="보스타임 관리"
          lines={[
            `오늘 ${bossSummary.total}타임`,
            `미처리 ${bossSummary.unprocessed}`,
            `정산 진행 ${bossSummary.settlementInProgress}`,
            `처리완료 ${bossSummary.completed}`,
          ]}
          onOpen={() => onNavigate(bossDateNav(today))}
        />

        <CategoryCard
          icon={<Shield className="h-4 w-4" />}
          title="공성 관리"
          lines={
            siegeCard
              ? siegeCard.inSurvey
                ? [
                    "이번 주 공성",
                    "참여조사 진행 중",
                    `${siegeCard.stats.intended + siegeCard.stats.declined} / ${siegeCard.stats.total} 응답`,
                  ]
                : [
                    "이번 주 공성",
                    siegeCard.siege.eventDate,
                    `${siegeCard.stats.intended}명 참여 예정`,
                  ]
              : ["공성 일정 없음"]
          }
          onOpen={() => onNavigate({ section: "siege" })}
        />

        <CategoryCard
          icon={<Users className="h-4 w-4" />}
          title="혈맹원 관리"
          lines={[
            `활동 ${memberStats.active}`,
            `휴면 ${memberStats.dormant}`,
            `탈퇴 ${memberStats.withdrawn}`,
          ]}
          onOpen={() => onNavigate({ section: "members" })}
        />

        <CategoryCard
          icon={<Coins className="h-4 w-4" />}
          title="재정 관리"
          lines={[
            `혈비 미납 ${unpaidDues}`,
            `이번 달 지출 ${monthExpenses}건`,
            `미완료 정산 ${incompleteSettlements}`,
          ]}
          onOpen={() => onNavigate(financeTabNav("settlements"))}
        />

        <CategoryCard
          icon={<Trophy className="h-4 w-4" />}
          title="기여도 관리"
          lines={[
            `이번 달 집계`,
            `평균 ${contributionSummary.average.toFixed(1)}점`,
            topContributor
              ? `1위 ${getMember(topContributor.memberId)?.nickname ?? ""} ${topContributor.breakdown.total}점`
              : "데이터 없음",
          ]}
          onOpen={() => onNavigate({ section: "contribution" })}
        />

        {canManageRoles && (
          <CategoryCard
            icon={<FolderOpen className="h-4 w-4" />}
            title="데이터 관리"
            lines={[
              "최고관리자 전용",
              "운영 현황 · 기간별 집계",
              "XLSX 내보내기",
            ]}
            onOpen={() => onNavigate(dataManagementNav())}
          />
        )}

        {canManageRoles && (
          <CategoryCard
            icon={<Database className="h-4 w-4" />}
            title="기초데이터 관리"
            lines={[
              "최고관리자 전용",
              "기초 혈맹자금 · 일괄 등록",
              "기여도 점수 설정",
            ]}
            onOpen={() => onNavigate(initialDataNav())}
          />
        )}
      </div>
    </div>
  )
}

function CategoryCard({
  icon,
  title,
  lines,
  onOpen,
}: {
  icon: React.ReactNode
  title: string
  lines: string[]
  onOpen: () => void
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
            {icon}
          </span>
          <p className="text-sm font-semibold text-foreground">{title}</p>
        </div>
        <div className="mt-3 space-y-0.5">
          {lines.map((line) => (
            <p key={line} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between border-t border-border bg-secondary/40 px-4 py-2.5 text-xs font-semibold text-primary hover:bg-secondary/70"
      >
        열기
        <ChevronRight className="h-4 w-4" />
      </button>
    </Card>
  )
}
