"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, Megaphone } from "lucide-react"
import { Badge, Card } from "@/components/ui-bits"
import type { MemberNoticePublic } from "@/lib/notices-types"
import { NOTICES_PAGE_SIZE } from "@/lib/notices-types"
import { truncateNoticeContent } from "@/lib/notice-visibility-utils"

type Props = {
  onBack: () => void
  onOpenNotice: (noticeId: string) => void
}

export function NoticesListScreen({ onBack, onOpenNotice }: Props) {
  const [notices, setNotices] = useState<MemberNoticePublic[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const loadPage = useCallback(async (pageOffset: number, append: boolean) => {
    if (append) setLoadingMore(true)
    else setLoading(true)

    try {
      const res = await fetch(
        `/api/notices?limit=${NOTICES_PAGE_SIZE}&offset=${pageOffset}`,
      )
      const data = (await res.json()) as {
        ok: boolean
        notices?: MemberNoticePublic[]
        hasMore?: boolean
      }
      if (data.ok && data.notices) {
        setNotices((prev) => (append ? [...prev, ...data.notices!] : data.notices!))
        setHasMore(!!data.hasMore)
        setOffset(pageOffset + data.notices.length)
      }
    } catch (error) {
      console.error("[NoticesListScreen]", error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    void loadPage(0, false)
  }, [loadPage])

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        홈으로
      </button>

      <h2 className="mb-4 text-lg font-semibold text-foreground">공지사항</h2>

      {loading && notices.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
      )}

      {!loading && notices.length === 0 && (
        <Card className="py-8 text-center text-sm text-muted-foreground">
          게시 중인 공지가 없습니다.
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {notices.map((notice) => (
          <button
            key={notice.id}
            type="button"
            onClick={() => onOpenNotice(notice.id)}
            className="text-left"
          >
            <Card className="py-3 transition-colors hover:bg-accent">
              <div className="flex items-start gap-3">
                <Megaphone className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-foreground">{notice.title}</p>
                    {notice.isImportant && (
                      <Badge tone="primary" className="text-[10px]">
                        중요
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {truncateNoticeContent(notice.content, 120)}
                  </p>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    게시 {notice.publishFromLabel}
                  </p>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>

      {hasMore && (
        <button
          type="button"
          disabled={loadingMore}
          onClick={() => void loadPage(offset, true)}
          className="mt-4 w-full rounded-xl border border-border py-2.5 text-sm font-medium text-primary disabled:opacity-50"
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      )}
    </div>
  )
}
