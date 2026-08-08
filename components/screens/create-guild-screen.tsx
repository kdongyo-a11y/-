"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-context"
import { ServiceBranding } from "@/components/service-branding"
import { GameServerSelect } from "@/components/game-server-select"
import { cn } from "@/lib/utils"
import { isValidGuildName, normalizeGuildName } from "@/lib/guild-types"

type Props = {
  onBack: () => void
}

export function CreateGuildScreen({ onBack }: Props) {
  const { login } = useAuth()
  const [serverId, setServerId] = useState("")
  const [guildName, setGuildName] = useState("")
  const [adminNickname, setAdminNickname] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)

    const normalizedName = normalizeGuildName(guildName)
    if (!serverId) {
      setError("서버를 선택해주세요.")
      return
    }
    if (!isValidGuildName(normalizedName)) {
      setError("혈맹명은 2~32자의 한글, 영문, 숫자로 입력해주세요.")
      return
    }
    if (!adminNickname.trim()) {
      setError("최고관리자 캐릭터명을 입력해주세요.")
      return
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.")
      return
    }
    if (password !== confirmPassword) {
      setError("비밀번호 확인이 일치하지 않습니다.")
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/onboarding/create-guild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId,
          guildName: normalizedName,
          adminNickname: adminNickname.trim(),
          password,
        }),
      })

      const data = (await res.json()) as { ok: boolean; message?: string }

      if (!data.ok) {
        setError(data.message ?? "혈맹 생성에 실패했습니다.")
        return
      }

      const loginResult = await login(serverId, normalizedName, adminNickname.trim(), password)
      if (!loginResult.ok) {
        setInfo("혈맹 생성은 완료되었습니다. 로그인해주세요.")
        onBack()
        return
      }
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background px-4">
      <div className="flex flex-1 flex-col justify-center py-8">
        <ServiceBranding size="md" showTitle={false} className="mb-6" />
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-foreground">새 혈맹 만들기</h1>
          <p className="mt-1 text-sm text-muted-foreground">최고관리자 계정과 함께 혈맹이 생성됩니다.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <GameServerSelect value={serverId} onChange={setServerId} disabled={submitting} />

          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              혈맹명 *
              <input
                type="text"
                value={guildName}
                onChange={(e) => setGuildName(e.target.value)}
                autoComplete="off"
                className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
                placeholder="혈맹명 입력"
              />
            </label>
            <p className="mt-1 text-[11px] text-muted-foreground">
              혈맹원이 로그인할 때 사용하는 이름입니다. 생성 후 변경할 수 없습니다.
            </p>
          </div>

          <Field
            label="최고관리자 캐릭터명 *"
            value={adminNickname}
            onChange={setAdminNickname}
            placeholder="캐릭터명"
          />

          <Field
            label="비밀번호 *"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="8자 이상"
            autoComplete="new-password"
          />

          <Field
            label="비밀번호 확인 *"
            value={confirmPassword}
            onChange={setConfirmPassword}
            type="password"
            placeholder="비밀번호 재입력"
            autoComplete="new-password"
          />

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}

          {info && (
            <p className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
              {info}
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
            {submitting ? "생성 중…" : "혈맹 생성"}
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="rounded-xl border border-border py-3 text-sm font-medium text-foreground"
          >
            로그인으로 돌아가기
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoComplete?: string
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-3 text-sm text-foreground"
        placeholder={placeholder}
      />
    </label>
  )
}
