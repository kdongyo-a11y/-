"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import { useMembers } from "@/components/members-context"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITIONS,
  type MemberCharacterClass,
  type MemberPosition,
} from "@/lib/member-types"

type BulkRow = {
  id: string
  nickname: string
  characterClass: MemberCharacterClass
  level: string
  position: MemberPosition
  joinDate: string
}

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

function newRow(): BulkRow {
  return {
    id: crypto.randomUUID(),
    nickname: "",
    characterClass: "기사",
    level: "70",
    position: "일반",
    joinDate: new Date().toISOString().slice(0, 10),
  }
}

export function AdminBulkMembersView({ onNavigate }: Props) {
  const { refreshMembers } = useMembers()
  const [rows, setRows] = useState<BulkRow[]>([newRow(), newRow(), newRow()])
  const [submitting, setSubmitting] = useState(false)

  function updateRow(id: string, patch: Partial<BulkRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)))
  }

  async function handleSubmit() {
    setSubmitting(true)
    const res = await fetch("/api/members/bulk-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        members: rows.map((r) => ({
          nickname: r.nickname.trim(),
          characterClass: r.characterClass,
          level: parseInt(r.level, 10),
          position: r.position,
          joinDate: r.joinDate,
        })),
      }),
    })
    const data = (await res.json()) as {
      ok: boolean
      message: string
      validationErrors?: { row: number; nickname: string; message: string }[]
      failures?: { row: number; nickname: string; message: string }[]
      successCount?: number
      failureCount?: number
    }
    setSubmitting(false)

    if (data.validationErrors?.length) {
      const detail = data.validationErrors
        .map((e) => `${e.row}행 ${e.nickname || "(빈 이름)"}: ${e.message}`)
        .join("\n")
      alert(`${data.message}\n\n${detail}`)
      return
    }

    if (data.failures?.length) {
      const detail = data.failures.map((e) => `${e.row}행 ${e.nickname}: ${e.message}`).join("\n")
      alert(`${data.message}\n\n${detail}`)
    } else {
      alert(data.message)
    }

    if ((data.successCount ?? 0) > 0) {
      await refreshMembers()
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리", onClick: () => onNavigate(initialDataNav()) },
          { label: "혈맹원 일괄 등록" },
        ]}
      />

      <SectionTitle>혈맹원 일괄 등록</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        각 캐릭터마다 Auth 계정과 members 레코드가 생성됩니다. 초기 비밀번호는 1234이며, 최초
        로그인 시 변경이 필요합니다.
      </p>

      <div className="mb-2 hidden text-[10px] font-medium text-muted-foreground sm:grid sm:grid-cols-[1.2fr_0.8fr_0.5fr_0.7fr_1fr_2rem] sm:gap-2">
        <span>캐릭터명</span>
        <span>클래스</span>
        <span>레벨</span>
        <span>직책</span>
        <span>가입일</span>
        <span />
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <Card key={row.id} className="grid gap-2 py-3 sm:grid-cols-[1.2fr_0.8fr_0.5fr_0.7fr_1fr_2rem] sm:items-center">
            <input
              value={row.nickname}
              onChange={(e) => updateRow(row.id, { nickname: e.target.value })}
              placeholder="캐릭터명"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
            <select
              value={row.characterClass}
              onChange={(e) => updateRow(row.id, { characterClass: e.target.value as MemberCharacterClass })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {MEMBER_CHARACTER_CLASSES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              value={row.level}
              onChange={(e) => updateRow(row.id, { level: e.target.value.replace(/\D/g, "") })}
              placeholder="레벨"
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
            <select
              value={row.position}
              onChange={(e) => updateRow(row.id, { position: e.target.value as MemberPosition })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            >
              {MEMBER_POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <input
              type="date"
              value={row.joinDate}
              onChange={(e) => updateRow(row.id, { joinDate: e.target.value })}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={() => removeRow(row.id)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive"
              aria-label="행 삭제"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Card>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, newRow()])}
        className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-border py-2.5 text-sm text-muted-foreground hover:bg-accent"
      >
        <Plus className="h-4 w-4" />
        행 추가
      </button>

      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={submitting}
        className="mt-4 w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? "등록 중..." : "일괄 등록"}
      </button>
    </div>
  )
}
