"use client"

import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { Badge, Card } from "@/components/ui-bits"
import { useParticipation, type Attendee } from "@/components/participation-context"
import { useMembers } from "@/components/members-context"
import type { BossTimeSlot } from "@/lib/boss-time-slots"

type Props = {
  slot: BossTimeSlot
  onClose: () => void
}

export function AdminBossParticipantsModal({ slot, onClose }: Props) {
  const { getCheck } = useParticipation()
  const { getMember } = useMembers()
  const [query, setQuery] = useState("")

  const check = getCheck(slot.id)
  const attendees = check.attendees

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return attendees
    return attendees.filter((a) => {
      const member = getMember(a.memberId)
      return (
        a.name.toLowerCase().includes(q) ||
        member?.characterClass.toLowerCase().includes(q)
      )
    })
  }, [attendees, query, getMember])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl border border-border bg-background shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">{slot.time} {slot.label}</p>
            <p className="text-xs text-muted-foreground">참여자 {attendees.length}명</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="캐릭터명·클래스 검색"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">참여자 없음</p>
          ) : (
            <div className="flex flex-col gap-2">
              {filtered.map((a) => (
                <AttendeeRow key={a.memberId} attendee={a} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AttendeeRow({ attendee }: { attendee: Attendee }) {
  const { getMember } = useMembers()
  const member = getMember(attendee.memberId)

  return (
    <Card className="flex items-center justify-between py-2.5">
      <div>
        <p className="text-sm font-medium">{attendee.name}</p>
        <p className="text-[11px] text-muted-foreground">
          {member ? `${member.characterClass} · Lv.${member.level}` : "혈원 정보 없음"}
        </p>
      </div>
      <Badge tone={attendee.method === "코드" ? "primary" : "neutral"}>
        {attendee.method === "코드" ? "코드" : "수동"}
      </Badge>
    </Card>
  )
}
