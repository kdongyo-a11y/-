"use client"

import { useState } from "react"
import { KeyRound, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  open: boolean
  onClose: () => void
  onSubmit: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ ok: boolean; message: string }>
}

export function ProfileChangePasswordModal({ open, onClose, onSubmit }: Props) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!open) return null

  function handleClose() {
    if (submitting) return
    setCurrentPassword("")
    setNewPassword("")
    setConfirmPassword("")
    setError(null)
    setSuccess(null)
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    const result = await onSubmit(currentPassword, newPassword, confirmPassword)
    if (result.ok) {
      setSuccess(result.message)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      setTimeout(handleClose, 1500)
    } else {
      setError(result.message)
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-lg"
        role="dialog"
        aria-labelledby="change-password-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <KeyRound className="h-4 w-4" />
            </div>
            <h2 id="change-password-title" className="text-base font-semibold">
              비밀번호 변경
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 text-xs text-muted-foreground">
          8자 이상, 초기 비밀번호(1234) 사용 불가, 현재 비밀번호와 다른 값이어야 합니다.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <PasswordField
            label="현재 비밀번호"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <PasswordField
            label="새 비밀번호"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
            placeholder="8자 이상"
          />
          <PasswordField
            label="새 비밀번호 확인"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
            placeholder="비밀번호 재입력"
          />

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-xl border border-success/30 bg-success/10 px-3 py-2 text-xs text-success">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !!success}
            className={cn(
              "mt-1 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground",
              (submitting || success) && "opacity-70",
            )}
          >
            변경
          </button>
        </form>
      </div>
    </div>
  )
}

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete: string
  placeholder?: string
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm"
      />
    </label>
  )
}
