"use client"

import { useEffect, useState } from "react"
import { ChevronLeft } from "lucide-react"
import { Badge, Card } from "@/components/ui-bits"
import type { MemberNoticePublic } from "@/lib/notices-types"

type Props = {
  noticeId: string
  onBack: () => void
}

export function NoticeDetailScreen({ noticeId, onBack }: Props) {
  const [notice, setNotice] = useState<MemberNoticePublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void fetch(`/api/notices/${noticeId}`)
      .then((res) => res.json())
      .then((data: { ok: boolean; notice?: MemberNoticePublic; message?: string }) => {
        if (cancelled) return
        if (data.ok && data.notice) {
          setNotice(data.notice)
          setError(null)
        } else {
          setError(data.message ?? "공지를 불러오지 못했습니다.")
        }
      })
      .catch(() => {
        if (!cancelled) setError("공지를 불러오지 못했습니다.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [noticeId])

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        목록으로
      </button>

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
      )}

      {error && (
        <Card className="py-8 text-center text-sm text-destructive">{error}</Card>
      )}

      {notice && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{notice.title}</h2>
            {notice.isImportant && (
              <Badge tone="primary" className="text-[10px]">
                중요
              </Badge>
            )}
          </div>

          <div className="space-y-1 text-xs text-muted-foreground">
            <p>게시 시작: {notice.publishFromLabel}</p>
            <p>작성일: {notice.createdAtLabel}</p>
            {notice.authorNickname && <p>작성: {notice.authorNickname}</p>}
          </div>

          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {notice.content}
          </div>
        </Card>
      )}
    </div>
  )
}
