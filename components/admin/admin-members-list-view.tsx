"use client"

import { useMemo, useState } from "react"
import { Plus, Crown, Search, RotateCcw } from "lucide-react"
import { Badge, Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useAuth } from "@/components/auth-context"
import { useMembers } from "@/components/members-context"
import { useParticipation } from "@/components/participation-context"
import { useSiege } from "@/components/siege-context"
import { useContributionSettings } from "@/components/contribution-settings-context"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITION_LABELS,
  MEMBER_ROLE_LABELS,
  type Member,
  type MemberCharacterClass,
} from "@/lib/member-types"
import { memberDetailNav } from "@/components/admin/admin-nav-helpers"
import { INITIAL_MEMBER_PASSWORD } from "@/lib/auth-constants"
import { computeMemberContribution, getAllTimePeriod } from "@/lib/contribution-utils"
import {
  getMemberLevel,
  MEMBER_SORT_OPTIONS,
  normalizeMemberJoinDate,
  sortMembers,
  type MemberSortOption,
} from "@/lib/member-list-sort"
import { cn } from "@/lib/utils"
import { AddMemberForm } from "@/components/admin/admin-member-form-parts"

type StatusFilter = "전체" | Member["status"]
type ClassFilter = "전체" | MemberCharacterClass

const CLASS_FILTER_OPTIONS: ClassFilter[] = ["전체", ...MEMBER_CHARACTER_CLASSES]

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminMembersListView({ onNavigate }: Props) {
  const { members, getStats, addMember } = useMembers()
  const { currentMemberId, canManageRoles } = useAuth()
  const { checks } = useParticipation()
  const { sieges } = useSiege()
  const { settings } = useContributionSettings()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("전체")
  const [classFilter, setClassFilter] = useState<ClassFilter>("전체")
  const [sortBy, setSortBy] = useState<MemberSortOption>("joinDate")
  const [showAddForm, setShowAddForm] = useState(false)

  const stats = getStats()
  const allTimePeriod = useMemo(() => getAllTimePeriod(), [])

  const contributionByMemberId = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of members) {
      map.set(
        m.id,
        computeMemberContribution(m.id, allTimePeriod, checks, sieges, settings).breakdown.total,
      )
    }
    return map
  }, [members, checks, sieges, settings, allTimePeriod])

  const hasActiveFilters =
    search.trim() !== "" || statusFilter !== "전체" || classFilter !== "전체"

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()

    const list = members.filter((m) => {
      if (statusFilter !== "전체" && m.status !== statusFilter) return false
      if (classFilter !== "전체" && m.characterClass !== classFilter) return false
      if (q && !m.nickname.toLowerCase().includes(q)) return false
      return true
    })

    return sortMembers(list, sortBy, contributionByMemberId)
  }, [members, search, statusFilter, classFilter, sortBy, contributionByMemberId])

  const activeSortLabel =
    MEMBER_SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "최근 가입순"

  const filterSummary = useMemo(() => {
    const parts: string[] = []
    if (statusFilter !== "전체") parts.push(statusFilter)
    if (classFilter !== "전체") parts.push(classFilter)
    if (search.trim()) parts.push(`"${search.trim()}"`)
    parts.push(activeSortLabel)
    return parts.join(" · ")
  }, [statusFilter, classFilter, search, activeSortLabel])

  function resetFilters() {
    setSearch("")
    setStatusFilter("전체")
    setClassFilter("전체")
    setSortBy("joinDate")
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "혈맹원 관리" },
        ]}
      />

      <Card className="mb-4 grid grid-cols-2 gap-2 py-3 text-center text-xs">
        <StatChip label="전체" value={stats.total} />
        <StatChip label="활동" value={stats.active} tone="success" />
        <StatChip label="휴면" value={stats.dormant} tone="warning" />
        <StatChip label="탈퇴" value={stats.withdrawn} />
        <StatChip label="관리자 권한" value={stats.managers} tone="primary" className="col-span-2" />
      </Card>

      <button
        type="button"
        onClick={() => setShowAddForm((v) => !v)}
        className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
      >
        <Plus className="h-4 w-4" />
        혈맹원 추가
      </button>

      {showAddForm && (
        <AddMemberForm
          onCancel={() => setShowAddForm(false)}
          onSubmit={async (input) => {
            const r = await addMember(input, currentMemberId ?? undefined)
            if (!r.ok) {
              alert(r.message)
              return
            }
            alert(
              `${r.message}\n로그인 계정이 자동 생성되었습니다. 초기 비밀번호: ${INITIAL_MEMBER_PASSWORD} (최초 로그인 후 변경)`,
            )
            setShowAddForm(false)
          }}
          canManageRoles={canManageRoles}
        />
      )}

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="닉네임 검색..."
          className="w-full rounded-xl border border-border bg-input py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary"
        />
      </div>

      <p className="mb-1 text-[10px] font-medium text-muted-foreground">혈맹 상태</p>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {(["전체", "활동", "휴면", "탈퇴"] as StatusFilter[]).map((f) => (
          <FilterChip key={f} active={statusFilter === f} onClick={() => setStatusFilter(f)} label={f} />
        ))}
      </div>

      <p className="mb-1 text-[10px] font-medium text-muted-foreground">클래스</p>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {CLASS_FILTER_OPTIONS.map((f) => (
          <FilterChip
            key={f}
            active={classFilter === f}
            onClick={() => setClassFilter(f)}
            label={f}
          />
        ))}
      </div>

      <p className="mb-1 text-[10px] font-medium text-muted-foreground">정렬</p>
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {MEMBER_SORT_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.value}
            active={sortBy === opt.value}
            onClick={() => setSortBy(opt.value)}
            label={opt.label}
          />
        ))}
      </div>

      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{filterSummary}</span>
          {" · "}
          {filtered.length}명
        </p>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"
          >
            <RotateCcw className="h-3 w-3" />
            초기화
          </button>
        )}
      </div>

      <SectionTitle action={<span className="text-xs text-muted-foreground">{filtered.length}명</span>}>
        혈맹원 목록
      </SectionTitle>

      <div className="flex flex-col gap-2" key={`member-list-${sortBy}`}>
        {filtered.map((m) => {
          const contribution = contributionByMemberId.get(m.id) ?? 0
          const level = getMemberLevel(m)
          const joinDate = normalizeMemberJoinDate(m.joinDate)

          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onNavigate(memberDetailNav(m.id))}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left hover:bg-accent"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-semibold">
                {m.nickname.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-medium">{m.nickname}</p>
                  {(m.role === "admin" || m.role === "manager") && (
                    <Crown className="h-3.5 w-3.5 text-primary" />
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {m.characterClass} · {MEMBER_POSITION_LABELS[m.position]}
                </p>
                <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">
                  <span className={cn(sortBy === "level" && "font-semibold text-primary")}>
                    Lv.{level}
                  </span>
                  {" · "}
                  <span className={cn(sortBy === "joinDate" && "font-semibold text-primary")}>
                    {joinDate}
                  </span>
                  {" · "}
                  <span className={cn(sortBy === "contribution" && "font-semibold text-primary")}>
                    {contribution}점
                  </span>
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge tone={m.status === "활동" ? "success" : m.status === "휴면" ? "warning" : "neutral"}>
                  {m.status}
                </Badge>
                <span className="text-[10px] text-muted-foreground">{MEMBER_ROLE_LABELS[m.role]}</span>
              </div>
            </button>
          )
        })}
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            조건에 맞는 혈맹원이 없습니다.
          </p>
        )}
      </div>
    </div>
  )
}

function StatChip({
  label,
  value,
  tone,
  className,
}: {
  label: string
  value: number
  tone?: "success" | "warning" | "primary"
  className?: string
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "primary"
          ? "text-primary"
          : "text-foreground"
  return (
    <div className={className}>
      <p className={cn("text-base font-semibold tabular-nums", color)}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        active
          ? "border-primary/40 bg-primary/15 text-primary"
          : "border-border bg-secondary text-muted-foreground",
      )}
    >
      {label}
    </button>
  )
}
