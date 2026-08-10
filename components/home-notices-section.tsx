"use client"

import { Megaphone, ChevronRight } from "lucide-react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { useNotices } from "@/components/notices-context"
import { truncateNoticeContent } from "@/lib/notice-visibility-utils"

type Props = {
  onShowAll: () => void
  onOpenNotice: (noticeId: string) => void
}

export function HomeNoticesSection({ onShowAll, onOpenNotice }: Props) {
  const { homePreview } = useNotices()

  if (homePreview.length === 0) return null

  return (
    <div className="mb-4">
      <SectionTitle
        action={
          <button
            type="button"
            onClick={onShowAll}
            className="flex items-center gap-0.5 text-xs font-medium text-primary"
          >
            전체 공지 보기
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        공지사항
      </SectionTitle>

      <div className="flex flex-col gap-2">
        {homePreview.map((notice) => (
          <button
            key={notice.id}
            type="button"
            onClick={() => onOpenNotice(notice.id)}
            className="text-left"
          >
            <Card
              className={`py-3 transition-colors hover:bg-accent ${
                notice.isImportant ? "border-primary/30 bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <Megaphone className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{notice.title}</p>
                    {notice.isImportant && (
                      <Badge tone="primary" className="text-[10px]">
                        중요
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {truncateNoticeContent(notice.content)}
                  </p>
                  <p className="mt-1.5 text-[10px] text-muted-foreground">
                    {notice.publishFromLabel}
                  </p>
                </div>
              </div>
            </Card>
          </button>
        ))}
      </div>
    </div>
  )
}
