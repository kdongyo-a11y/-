"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Badge, Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import { AdminSiegePanel } from "@/components/admin-siege-panel"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useSiege, getSiegeStatusLabel } from "@/components/siege-context"
import { useSettlement } from "@/components/settlement-context"
import {
  computeSiegeFinancialStatus,
  SIEGE_FINANCIAL_LABELS,
  SIEGE_PARTICIPATION_LABELS,
} from "@/lib/siege-admin-status"
import { getThisWeekSunday, formatSiegeTimeRange } from "@/lib/siege-utils"
import { siegeDetailNav } from "@/components/admin/admin-nav-helpers"

type Props = {
  siegeId?: string
  onNavigate: (nav: AdminNavState) => void
}

export function AdminSiegeView({ siegeId, onNavigate }: Props) {
  const { sieges, createSiege, getSurveyStats, getSiegeFinancialFlags } = useSiege()
  const { getSiegeSettlement } = useSettlement()

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createDate, setCreateDate] = useState(getThisWeekSunday())
  const [createStart, setCreateStart] = useState("20:00")
  const [createEnd, setCreateEnd] = useState("21:00")
  const [createMemo, setCreateMemo] = useState("")
  const [createFeedback, setCreateFeedback] = useState<string | null>(null)

  if (siegeId) {
    const siege = sieges.find((s) => s.id === siegeId)
    if (!siege) {
      return (
        <Card className="py-6 text-center text-sm text-muted-foreground">
          공성을 찾을 수 없습니다.
        </Card>
      )
    }

    return (
      <div>
        <AdminBreadcrumb
          items={[
            { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
            { label: "공성 관리", onClick: () => onNavigate({ section: "siege" }) },
            { label: `${siege.eventDate} 공성` },
          ]}
        />
        <AdminSiegePanel siegeId={siegeId} embedded />
      </div>
    )
  }

  async function handleCreate() {
    const result = await createSiege({
      eventDate: createDate,
      startTime: createStart,
      endTime: createEnd,
      memo: createMemo,
    })
    setCreateFeedback(result.message)
    if (result.ok) {
      setShowCreateForm(false)
      setCreateMemo("")
      onNavigate(siegeDetailNav(`siege-${createDate}`))
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "공성 관리" },
        ]}
      />

      <SectionTitle>공성 관리</SectionTitle>
      <p className="mb-3 text-[11px] text-muted-foreground">
        보스타임과 별도로 관리되는 주간 공성 이벤트입니다.
      </p>

      {!showCreateForm ? (
        <button
          type="button"
          onClick={() => {
            setShowCreateForm(true)
            setCreateDate(getThisWeekSunday())
            setCreateFeedback(null)
          }}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 py-3 text-sm font-semibold text-primary"
        >
          <Plus className="h-4 w-4" />
          공성 참여 생성
        </button>
      ) : (
        <Card className="mb-4 flex flex-col gap-3">
          <label className="block text-xs font-medium text-muted-foreground">
            공성 날짜 (일요일)
            <input
              type="date"
              value={createDate}
              onChange={(e) => setCreateDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-xs font-medium text-muted-foreground">
              시작
              <input
                type="time"
                value={createStart}
                onChange={(e) => setCreateStart(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              종료
              <input
                type="time"
                value={createEnd}
                onChange={(e) => setCreateEnd(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
              />
            </label>
          </div>
          <textarea
            value={createMemo}
            onChange={(e) => setCreateMemo(e.target.value)}
            placeholder="메모 (선택)"
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm"
          />
          {createFeedback && (
            <p className="text-center text-xs text-muted-foreground">{createFeedback}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="flex-1 rounded-xl border border-border py-2.5 text-sm text-muted-foreground"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleCreate}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
            >
              생성
            </button>
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {sieges.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">
            생성된 공성이 없습니다.
          </Card>
        )}
        {[...sieges].reverse().map((siege) => {
          const stats = getSurveyStats(siege.id)
          const settlement = getSiegeSettlement(siege.id)
          const flags = getSiegeFinancialFlags(siege.id)
          const financial = computeSiegeFinancialStatus({
            flags,
            attendanceReady:
              siege.status === "attendance_confirmed" ||
              siege.status === "settling" ||
              siege.status === "completed",
            hasSettlement: !!settlement,
            settlementParticipants: settlement?.participants ?? [],
          })

          return (
            <button
              key={siege.id}
              type="button"
              onClick={() => onNavigate(siegeDetailNav(siege.id))}
              className="rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
            >
              <p className="font-semibold text-foreground">{siege.eventDate} 공성</p>
              <p className="font-mono text-xs text-muted-foreground">
                {formatSiegeTimeRange(siege.startTime, siege.endTime)}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Badge tone="primary">
                  참여: {SIEGE_PARTICIPATION_LABELS[siege.status] ?? getSiegeStatusLabel(siege.status)}
                </Badge>
                <Badge tone={financial === "pending" ? "warning" : "neutral"}>
                  재정: {SIEGE_FINANCIAL_LABELS[financial]}
                </Badge>
              </div>
              {siege.status === "survey_open" && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  응답 {stats.intended + stats.declined} / {stats.total}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
