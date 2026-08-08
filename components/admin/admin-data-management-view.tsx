"use client"

import { ChevronRight, BarChart3, LineChart, Download } from "lucide-react"
import { SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { dataManagementTabNav } from "@/components/admin/admin-nav-helpers"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminDataManagementView({ onNavigate }: Props) {
  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "데이터 관리" },
        ]}
      />
      <SectionTitle>데이터 관리</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        운영 현황 조회, 기간별 집계, XLSX 내보내기. 최고관리자만 접근할 수 있습니다.
      </p>

      <div className="flex flex-col gap-3">
        <MenuCard
          icon={<BarChart3 className="h-4 w-4" />}
          title="운영 현황"
          description="혈맹원·보스·공성·정산·혈비·재정 요약과 최근 활동"
          onClick={() => onNavigate(dataManagementTabNav("dashboard"))}
        />
        <MenuCard
          icon={<LineChart className="h-4 w-4" />}
          title="기간별 집계"
          description="일/월별 보스·공성·정산·혈비·지출·장부·기여도 집계"
          onClick={() => onNavigate(dataManagementTabNav("aggregates"))}
        />
        <MenuCard
          icon={<Download className="h-4 w-4" />}
          title="데이터 내보내기"
          description="선택한 기간과 데이터 종류를 XLSX로 다운로드"
          onClick={() => onNavigate(dataManagementTabNav("export"))}
        />
      </div>
    </div>
  )
}

function MenuCard({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-xl border border-border bg-card p-4 text-left hover:bg-accent"
    >
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}
