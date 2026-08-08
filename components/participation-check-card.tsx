"use client"

import { useEffect, useRef, useState } from "react"
import { Radio, CheckCircle2, AlertCircle } from "lucide-react"
import { useParticipation, formatCheckTime } from "@/components/participation-context"
import { useCurrentMemberId } from "@/components/auth-context"
import { cn } from "@/lib/utils"

export function ParticipationCheckCard({ embedded }: { embedded?: boolean }) {
  const { getOpenCheck, submitCode, hasJoined } = useParticipation()
  const open = getOpenCheck()
  const [digits, setDigits] = useState<string[]>(["", "", "", ""])
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  const slotId = open?.slot.id
  const memberId = useCurrentMemberId()
  const joined = slotId ? hasJoined(slotId, memberId) : false
  const attendee = open?.check.attendees.find((a) => a.memberId === memberId)

  useEffect(() => {
    setDigits(["", "", "", ""])
    setFeedback(null)
  }, [open?.check.startedAt, open?.check.code])

  if (!open) return null

  const { slot, check } = open
  const slotTitle = `${slot.time} ${slot.label}`.trim()

  function handleChange(index: number, value: string) {
    const v = value.replace(/\D/g, "").slice(-1)
    setDigits((prev) => {
      const next = [...prev]
      next[index] = v
      return next
    })
    setFeedback(null)
    if (v && index < 3) inputsRef.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  async function handleSubmit() {
    const code = digits.join("")
    if (code.length < 4) {
      setFeedback({ ok: false, message: "4자리 코드를 모두 입력해주세요." })
      return
    }
    const result = await submitCode(code)
    setFeedback(result)
    if (!result.ok && result.message === "참여코드가 올바르지 않습니다.") {
      setDigits(["", "", "", ""])
      inputsRef.current[0]?.focus()
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-warning/30 bg-gradient-to-br from-warning/15 to-card",
        !embedded && "mb-4",
      )}
    >
      <div className="flex items-center justify-between border-b border-warning/20 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-warning">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
          </span>
          <Radio className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">참여체크 진행 중</span>
        </div>
        <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{slot.time}</span>
      </div>

      <div className="p-4">
        <p className="text-sm font-semibold text-foreground">{slotTitle}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          관리자가 게임 내에서 안내한 4자리 참여코드를 입력하세요.
        </p>

        {joined && attendee ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-success/15 px-4 py-3 text-success">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">{slot.time} 보스타임 참여 완료</p>
              <p className="text-xs opacity-80">체크시간 {formatCheckTime(attendee.checkedAt)}</p>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-3 text-center text-xs font-medium text-muted-foreground">참여코드</p>
            <div className="mt-2 flex items-center justify-center gap-2.5">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el
                  }}
                  value={d}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  inputMode="numeric"
                  maxLength={1}
                  aria-label={`참여코드 ${i + 1}번째 자리`}
                  className="h-14 w-12 rounded-xl border border-border bg-input text-center font-mono text-2xl font-semibold text-foreground outline-none transition-colors focus:border-warning focus:ring-1 focus:ring-warning"
                />
              ))}
            </div>

            {feedback && (
              <p
                className={cn(
                  "mt-2.5 flex items-center justify-center gap-1 text-xs font-medium",
                  feedback.ok ? "text-success" : "text-destructive",
                )}
              >
                {feedback.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {feedback.message}
              </p>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              className="mt-3 w-full rounded-xl bg-warning py-3 text-sm font-semibold text-warning-foreground transition-opacity hover:opacity-90"
            >
              참여 확인
            </button>
          </>
        )}

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          현재 {check.attendees.length}명 참여 중
        </p>
      </div>
    </div>
  )
}
