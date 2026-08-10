"use client"

import { ChevronRight, Database, Shield, Users, Trophy, Settings2 } from "lucide-react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataTabNav } from "@/components/admin/admin-nav-helpers"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminInitialDataView({ onNavigate }: Props) {
  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리" },
        ]}
      />
      <SectionTitle>기초데이터 관리</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        운영 시작 전 기초 데이터와 기준값을 설정합니다. 최고관리자만 접근할 수 있습니다.
      </p>

      <div className="flex flex-col gap-3">
        <MenuCard
          icon={<Shield className="h-4 w-4" />}
          title="혈맹마크 관리"
          description="혈맹명과 혈맹마크를 변경합니다."
          onClick={() => onNavigate(initialDataTabNav("guild_profile"))}
        />
        <MenuCard
          icon={<Database className="h-4 w-4" />}
          title="기초 혈맹자금"
          description="프로그램 사용 시작 이전부터 보유하고 있던 혈맹 자금을 입력합니다."
          onClick={() => onNavigate(initialDataTabNav("opening_balance"))}
        />
        <MenuCard
          icon={<Users className="h-4 w-4" />}
          title="혈맹원 일괄 등록"
          description="여러 캐릭터를 한 번에 등록합니다. 초기 비밀번호는 1234입니다."
          onClick={() => onNavigate(initialDataTabNav("bulk_members"))}
        />
        <MenuCard
          icon={<Trophy className="h-4 w-4" />}
          title="기여도 점수 설정"
          description="보스/공성 기여도 점수와 적용 시작일을 관리합니다."
          onClick={() => onNavigate(initialDataTabNav("contribution_scores"))}
        />
        <MenuCard
          icon={<Settings2 className="h-4 w-4" />}
          title="운영 정책"
          description="관리비·혈맹 비축 산정 방식과 관리비 배분 비율을 설정합니다."
          onClick={() => onNavigate(initialDataTabNav("operation_policy"))}
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
