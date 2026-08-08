"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-context"
import { ServiceBranding } from "@/components/service-branding"
import { GameServerSelect } from "@/components/game-server-select"
import { cn } from "@/lib/utils"
import { CreateGuildScreen } from "@/components/screens/create-guild-screen"

export function AuthEntryScreen() {
  const [mode, setMode] = useState<"login" | "create">("login")

  if (mode === "create") {
    return <CreateGuildScreen onBack={() => setMode("login")} />
  }

  return <LoginScreen onCreateGuild={() => setMode("create")} />
}

export function LoginScreen({ onCreateGuild }: { onCreateGuild?: () => void }) {
  const { login } = useAuth()
  const [serverId, setServerId] = useState("")
  const [guildName, setGuildName] = useState("")
  const [nickname, setNickname] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const result = await login(serverId, guildName, nickname, password)
    if (!result.ok) setError(result.message)
    setSubmitting(false)
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background px-4">
      <div className="flex flex-1 flex-col justify-center py-8">
        <ServiceBranding size="md" className="mb-8" />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <GameServerSelect value={serverId} onChange={setServerId} disabled={submitting} />

          <label className="block text-xs font-medium text-muted-foreground">
            혈맹명
            <input
              type="text"
              value={guildName}
              onChange={(e) => setGuildName(e.target.value)}
              autoComplete="organization"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
              placeholder="혈맹명 입력"
            />
          </label>

          <label className="block text-xs font-medium text-muted-foreground">
            캐릭터명
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="username"
              className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
              placeholder="캐릭터명 입력"
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
              placeholder="비밀번호 입력"
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

          {onCreateGuild && (
            <button
              type="button"
              onClick={onCreateGuild}
              className="rounded-xl border border-border py-3 text-sm font-medium text-foreground"
            >
              새 혈맹 만들기
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
