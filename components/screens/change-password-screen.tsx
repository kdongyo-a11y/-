"use client"

import { useState } from "react"
import { KeyRound, Shield } from "lucide-react"
import { useAuth } from "@/components/auth-context"
import { GuildNameText, ServerNameText } from "@/components/guild-profile-context"
import { cn } from "@/lib/utils"

export function ChangePasswordScreen() {
  const { currentMember, changePassword, logout } = useAuth()
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await changePassword(newPassword, confirmPassword)
    if (!result.ok) setError(result.message)
    setSubmitting(false)
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background px-4">
      <div className="flex flex-1 flex-col justify-center py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <KeyRound className="h-7 w-7" strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-semibold text-foreground">최초 로그인 비밀번호 변경</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <GuildNameText className="text-sm font-medium text-foreground" />
            {" · "}
            <ServerNameText className="text-sm text-muted-foreground" />
          </p>
          {currentMember && (
            <p className="mt-2 text-xs text-muted-foreground">
              {currentMember.nickname} — 새 비밀번호를 설정해주세요. (8자 이상, 1234 사용 불가)
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="block text-xs font-medium text-muted-foreground">
            새 비밀번호
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm"
              placeholder="8자 이상"
            />
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
            새 비밀번호 확인
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm"
              placeholder="비밀번호 재입력"
            />
          </label>

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "mt-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground",
              submitting && "opacity-70",
            )}
          >
            비밀번호 변경
          </button>

          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center justify-center gap-1.5 py-2 text-xs text-muted-foreground"
          >
            <Shield className="h-3.5 w-3.5" />
            다른 계정으로 로그인
          </button>
        </form>
      </div>
    </div>
  )
}
