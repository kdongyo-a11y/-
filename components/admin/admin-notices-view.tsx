"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, SectionTitle, Badge } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { ADMIN_HOME } from "@/components/admin/admin-types"
import type { AdminNoticeSummary } from "@/lib/notices-types"
import { formatKstDateTimeLabel, isoToKstParts } from "@/lib/operation-policy-kst-utils"
import { useAuth } from "@/components/auth-context"
import { trackInteraction } from "@/lib/interaction-perf"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

const STATUS_LABELS: Record<AdminNoticeSummary["displayStatus"], string> = {
  published: "게시 중",
  scheduled: "예약",
  expired: "종료",
  archived: "보관",
}

export function AdminNoticesView({ onNavigate }: Props) {
  const { canManageRoles } = useAuth()
  const [notices, setNotices] = useState<AdminNoticeSummary[]>([])
  const [canSetImportant, setCanSetImportant] = useState(false)
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [isImportant, setIsImportant] = useState(false)
  const [publishFromMode, setPublishFromMode] = useState<"now" | "scheduled">("now")
  const [publishFromDate, setPublishFromDate] = useState("")
  const [publishFromTime, setPublishFromTime] = useState("00:00")
  const [publishUntilDate, setPublishUntilDate] = useState("")
  const [publishUntilTime, setPublishUntilTime] = useState("23:59")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/notices")
    const data = (await res.json()) as {
      ok: boolean
      notices?: AdminNoticeSummary[]
      canSetImportant?: boolean
      message?: string
    }
    if (!data.ok) {
      alert(data.message ?? "공지 목록을 불러오지 못했습니다.")
      return
    }
    setNotices(data.notices ?? [])
    setCanSetImportant(!!data.canSetImportant)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function resetForm() {
    setTitle("")
    setContent("")
    setIsImportant(false)
    setPublishFromMode("now")
    setPublishFromDate("")
    setPublishFromTime("00:00")
    setPublishUntilDate("")
    setPublishUntilTime("23:59")
    setEditingId(null)
  }

  function startEdit(notice: AdminNoticeSummary) {
    setEditingId(notice.id)
    setTitle(notice.title)
    setContent(notice.content)
    setIsImportant(notice.isImportant)
    setPublishFromMode("scheduled")
    const { date, time } = isoToKstParts(notice.publishFrom)
    setPublishFromDate(date)
    setPublishFromTime(time)
    if (notice.publishUntil) {
      const until = isoToKstParts(notice.publishUntil)
      setPublishUntilDate(until.date)
      setPublishUntilTime(until.time)
    } else {
      setPublishUntilDate("")
      setPublishUntilTime("23:59")
    }
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    const tracker = trackInteraction("notice-save")
    tracker.markPending()
    const res = await fetch("/api/admin/notices/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: editingId ? "update" : "create",
        noticeId: editingId ?? undefined,
        title,
        content,
        isImportant: canSetImportant ? isImportant : false,
        publishFromMode,
        publishFromDate: publishFromMode === "scheduled" ? publishFromDate : undefined,
        publishFromTime: publishFromMode === "scheduled" ? publishFromTime : undefined,
        publishUntilDate: publishUntilDate || null,
        publishUntilTime: publishUntilDate ? publishUntilTime : undefined,
      }),
    })
    const data = (await res.json()) as { ok: boolean; message: string; notices?: AdminNoticeSummary[] }
    setSaving(false)
    tracker.finish({ ok: data.ok })
    alert(data.message)
    if (data.ok) {
      resetForm()
      if (data.notices) setNotices(data.notices)
      else await load()
    }
  }

  async function handleArchive(noticeId: string) {
    if (!window.confirm("이 공지를 보관(게시 종료)하시겠습니까?")) return
    const res = await fetch("/api/admin/notices/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "archive", noticeId }),
    })
    const data = (await res.json()) as { ok: boolean; message: string; notices?: AdminNoticeSummary[] }
    alert(data.message)
    if (data.ok) {
      if (data.notices) setNotices(data.notices)
      else await load()
    }
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate(ADMIN_HOME) },
          { label: "공지사항" },
        ]}
      />

      <SectionTitle>공지사항 관리</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        혈맹원에게 전달할 공지를 작성합니다. 운영 정책 version과 별도로 관리됩니다.
        {canManageRoles ? "" : " 중요 공지 지정은 최고관리자만 가능합니다."}
      </p>

      <Card className="mb-4 flex flex-col gap-3">
        <p className="text-sm font-semibold">{editingId ? "공지 수정" : "새 공지 작성"}</p>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목"
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="본문"
          rows={5}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        {canSetImportant && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isImportant}
              onChange={(e) => setIsImportant(e.target.checked)}
            />
            중요 공지
          </label>
        )}
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">게시 시작 (KST)</p>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={publishFromMode === "now"}
                onChange={() => setPublishFromMode("now")}
              />
              지금 게시
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={publishFromMode === "scheduled"}
                onChange={() => setPublishFromMode("scheduled")}
              />
              예약 게시
            </label>
          </div>
          {publishFromMode === "scheduled" && (
            <div className="mt-2 flex gap-2">
              <input
                type="date"
                value={publishFromDate}
                onChange={(e) => setPublishFromDate(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
              <input
                type="time"
                value={publishFromTime}
                onChange={(e) => setPublishFromTime(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            게시 종료 (선택, KST)
          </p>
          <div className="flex gap-2">
            <input
              type="date"
              value={publishUntilDate}
              onChange={(e) => setPublishUntilDate(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
            <input
              type="time"
              value={publishUntilTime}
              onChange={(e) => setPublishUntilTime(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            비워두면 관리자가 보관할 때까지 게시됩니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "저장 중..." : editingId ? "수정" : "등록"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-border px-4 py-2.5 text-sm"
            >
              취소
            </button>
          )}
        </div>
      </Card>

      <SectionTitle>공지 목록</SectionTitle>
      <div className="flex flex-col gap-2">
        {notices.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">공지 없음</Card>
        )}
        {notices.map((n) => (
          <Card key={n.id} className="py-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{n.title}</p>
              {n.isImportant && (
                <Badge tone="primary" className="text-[10px]">
                  중요
                </Badge>
              )}
              <Badge tone="neutral" className="text-[10px]">
                {STATUS_LABELS[n.displayStatus]}
              </Badge>
            </div>
            <p className="mt-1 line-clamp-2 text-muted-foreground">{n.content}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              게시 {formatKstDateTimeLabel(n.publishFrom)}
              {n.publishUntil ? ` ~ ${formatKstDateTimeLabel(n.publishUntil)}` : ""}
              {n.authorNickname ? ` · ${n.authorNickname}` : ""}
            </p>
            {n.displayStatus !== "archived" && (
              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => startEdit(n)}
                  className="text-primary"
                >
                  수정
                </button>
                <button
                  type="button"
                  onClick={() => void handleArchive(n.id)}
                  className="text-destructive"
                >
                  보관
                </button>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
