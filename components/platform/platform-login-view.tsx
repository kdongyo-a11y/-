"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { cn } from "@/lib/utils"

export function PlatformLoginView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(() => {
    if (searchParams.get("error") === "forbidden") {
      return "플랫폼 운영자 권한이 없습니다."
    }
    return null
  })
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/platform/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const json = (await res.json()) as { ok: boolean; message?: string }

      if (!res.ok || !json.ok) {
        setError(json.message ?? "로그인에 실패했습니다.")
        return
      }

      router.replace("/platform")
      router.refresh()
    } catch {
      setError("로그인 처리 중 오류가 발생했습니다.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background px-4">
      <div className="flex flex-1 flex-col justify-center py-8">
        <div className="mb-8 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Platform Admin
          </p>
          <h1 className="mt-2 text-xl font-semibold text-foreground">서비스 운영자 로그인</h1>
          <p className="mt-2 text-xs text-muted-foreground">
            Supabase Auth 계정으로 로그인합니다. 혈맹 로그인과 별도입니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="block text-xs font-medium text-muted-foreground">
            이메일
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
              placeholder="운영자 이메일"
            />
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
            비밀번호
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
              placeholder="비밀번호"
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
            로그인
          </button>
        </form>
      </div>
    </div>
  )
}
