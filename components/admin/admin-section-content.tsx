"use client"

import { useAuth } from "@/components/auth-context"
import { AdminHomeView } from "@/components/admin/admin-home-view"
import { AdminBossDateView } from "@/components/admin/admin-boss-date-view"
import { AdminBossDetailView } from "@/components/admin/admin-boss-detail-view"
import { AdminSiegeView } from "@/components/admin/admin-siege-view"
import { AdminMembersView } from "@/components/admin/admin-members-view"
import { AdminFinanceView } from "@/components/admin/admin-finance-view"
import { AdminContributionView } from "@/components/admin/admin-contribution-view"
import { AdminDuesDetailView } from "@/components/admin/admin-dues-detail-view"
import { AdminInitialDataView } from "@/components/admin/admin-initial-data-view"
import { AdminOpeningBalanceView } from "@/components/admin/admin-opening-balance-view"
import { AdminBulkMembersView } from "@/components/admin/admin-bulk-members-view"
import { AdminContributionSettingsView } from "@/components/admin/admin-contribution-settings-view"
import { AdminOperationSettingsView } from "@/components/admin/admin-operation-settings-view"
import { AdminGuildProfileView } from "@/components/admin/admin-guild-profile-view"
import { AdminDataManagementView } from "@/components/admin/admin-data-management-view"
import { AdminDataDashboardView } from "@/components/admin/admin-data-dashboard-view"
import { AdminDataAggregatesView } from "@/components/admin/admin-data-aggregates-view"
import { AdminDataExportView } from "@/components/admin/admin-data-export-view"
import type { AdminNavState } from "@/components/admin/admin-types"
import { getTodayDateString } from "@/lib/boss-time-slots"

type Props = {
  nav: AdminNavState
  onNavigate: (nav: AdminNavState) => void
}

/** 섹션별 화면 — 각 하위 컴포넌트가 자체 Hook 사용 */
export function AdminSectionContent({ nav, onNavigate }: Props) {
  const { canManageRoles } = useAuth()

  if (nav.section === "initialData" && !canManageRoles) {
    return <AdminNoAccess />
  }

  if (nav.section === "dataManagement" && !canManageRoles) {
    return <AdminNoAccess />
  }

  switch (nav.section) {
    case "home":
      return <AdminHomeView onNavigate={onNavigate} />

    case "boss": {
      const date = nav.bossDate ?? getTodayDateString()
      if (nav.bossSlotId) {
        return (
          <AdminBossDetailView
            date={date}
            slotId={nav.bossSlotId}
            onNavigate={onNavigate}
          />
        )
      }
      return <AdminBossDateView date={date} onNavigate={onNavigate} />
    }

    case "siege":
      return <AdminSiegeView siegeId={nav.siegeId} onNavigate={onNavigate} />

    case "members":
      return <AdminMembersView memberId={nav.memberId} onNavigate={onNavigate} />

    case "finance":
      if (nav.duesBillId) {
        return <AdminDuesDetailView billId={nav.duesBillId} onNavigate={onNavigate} />
      }
      return (
        <AdminFinanceView tab={nav.financeTab ?? "settlements"} onNavigate={onNavigate} />
      )

    case "contribution":
      return (
        <AdminContributionView
          memberId={nav.contributionMemberId}
          onNavigate={onNavigate}
        />
      )

    case "initialData": {
      const tab = nav.initialDataTab
      if (tab === "guild_profile") {
        return <AdminGuildProfileView onNavigate={onNavigate} />
      }
      if (tab === "opening_balance") {
        return <AdminOpeningBalanceView onNavigate={onNavigate} />
      }
      if (tab === "bulk_members") {
        return <AdminBulkMembersView onNavigate={onNavigate} />
      }
      if (tab === "contribution_scores") {
        return <AdminContributionSettingsView onNavigate={onNavigate} />
      }
      if (tab === "operation_policy") {
        return <AdminOperationSettingsView onNavigate={onNavigate} />
      }
      return <AdminInitialDataView onNavigate={onNavigate} />
    }

    case "dataManagement": {
      const tab = nav.dataManagementTab
      if (tab === "dashboard") {
        return <AdminDataDashboardView onNavigate={onNavigate} />
      }
      if (tab === "aggregates") {
        return <AdminDataAggregatesView onNavigate={onNavigate} />
      }
      if (tab === "export") {
        return <AdminDataExportView onNavigate={onNavigate} />
      }
      return <AdminDataManagementView onNavigate={onNavigate} />
    }

    default:
      return <AdminHomeView onNavigate={onNavigate} />
  }
}

export function AdminNoAccess() {
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      관리자 권한이 없습니다.
    </p>
  )
}
