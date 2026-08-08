"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import type { Member, MemberProgramRole } from "@/lib/member-types"
import { tryCreateClient } from "@/lib/supabase/client"
import { fetchMemberByAuthUserId } from "@/lib/supabase/auth-helpers"
import { rowToMember, type MemberRow } from "@/lib/supabase/member-mapper"

type LoginResult = { ok: true } | { ok: false; message: string }

type AuthContextValue = {
  isHydrated: boolean
  isAuthenticated: boolean
  requiresPasswordChange: boolean
  currentMemberId: string | null
  currentMember: Member | null
  canAccessAdmin: boolean
  canManageRoles: boolean
  configError: string | null
  login: (serverId: string, guildName: string, nickname: string, password: string) => Promise<LoginResult>
  logout: () => Promise<void>
  changePassword: (
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ ok: boolean; message: string }>
  changePasswordWithCurrent: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) => Promise<{ ok: boolean; message: string }>
  refreshCurrentMember: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentMemberRow, setCurrentMemberRow] = useState<MemberRow | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  const supabase = useMemo(() => tryCreateClient(), [])

  const loadCurrentMember = useCallback(async () => {
    if (!supabase) {
      setConfigError(
        "Supabase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인해주세요.",
      )
      setCurrentMemberRow(null)
      return
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setCurrentMemberRow(null)
      return
    }

    const row = await fetchMemberByAuthUserId(supabase, user.id)
    setCurrentMemberRow(row)
  }, [supabase])

  useEffect(() => {
    if (!supabase) {
      setIsHydrated(true)
      return
    }

    let cancelled = false

    async function init() {
      await loadCurrentMember()
      if (!cancelled) setIsHydrated(true)
    }

    void init()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setCurrentMemberRow(null)
        return
      }
      void fetchMemberByAuthUserId(supabase, session.user.id).then((row) => {
        if (!cancelled) setCurrentMemberRow(row)
      })
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [supabase, loadCurrentMember])

  const currentMember = useMemo(
    () => (currentMemberRow ? rowToMember(currentMemberRow) : null),
    [currentMemberRow],
  )

  const login = useCallback(
    async (
      serverId: string,
      guildName: string,
      nickname: string,
      password: string,
    ): Promise<LoginResult> => {
      if (!supabase) {
        return { ok: false, message: "Supabase 연결이 설정되지 않았습니다." }
      }

      const trimmedServerId = serverId.trim()
      const trimmedName = guildName.trim()
      const trimmed = nickname.trim()
      if (!trimmedServerId || !trimmedName || !trimmed || !password) {
        return { ok: false, message: "서버, 혈맹명, 캐릭터명, 비밀번호를 입력해주세요." }
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serverId: trimmedServerId,
          guildName: trimmedName,
          nickname: trimmed,
          password,
        }),
      })

      const data = (await res.json()) as {
        ok: boolean
        message?: string
        member?: Member
        requiresPasswordChange?: boolean
      }

      if (!data.ok) {
        return { ok: false, message: data.message ?? "로그인에 실패했습니다." }
      }

      await supabase.auth.getSession()
      await loadCurrentMember()
      return { ok: true }
    },
    [supabase, loadCurrentMember],
  )

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" })
    if (supabase) await supabase.auth.signOut()
    setCurrentMemberRow(null)
  }, [supabase])

  const changePasswordWithCurrent = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
      confirmPassword: string,
    ): Promise<{ ok: boolean; message: string }> => {
      try {
        const res = await fetch("/api/auth/change-password-with-current", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        })
        const data = (await res.json()) as { ok: boolean; message?: string }
        return {
          ok: data.ok,
          message: data.message ?? "비밀번호 변경에 실패했습니다.",
        }
      } catch {
        return {
          ok: false,
          message: "네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        }
      }
    },
    [],
  )

  const changePassword = useCallback(
    async (
      newPassword: string,
      confirmPassword: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
      })
      const data = (await res.json()) as { ok: boolean; message?: string }
      if (data.ok) {
        await loadCurrentMember()
      }
      return { ok: data.ok, message: data.message ?? "비밀번호 변경에 실패했습니다." }
    },
    [loadCurrentMember],
  )

  const canAccessAdmin =
    currentMember?.role === "manager" || currentMember?.role === "admin"
  const canManageRoles = currentMember?.role === "admin"

  const value = useMemo<AuthContextValue>(
    () => ({
      isHydrated,
      isAuthenticated: !!currentMember,
      requiresPasswordChange: !!currentMember?.mustChangePassword,
      currentMemberId: currentMember?.id ?? null,
      currentMember,
      canAccessAdmin,
      canManageRoles,
      configError,
      login,
      logout,
      changePassword,
      changePasswordWithCurrent,
      refreshCurrentMember: loadCurrentMember,
    }),
    [
      isHydrated,
      currentMember,
      canAccessAdmin,
      canManageRoles,
      configError,
      login,
      logout,
      changePassword,
      changePasswordWithCurrent,
      loadCurrentMember,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export function useCurrentMemberId(): string {
  const { currentMemberId } = useAuth()
  if (!currentMemberId) throw new Error("Authentication required")
  return currentMemberId
}

export function useOptionalCurrentMemberId(): string | null {
  return useAuth().currentMemberId
}

export function isAdminRole(role: MemberProgramRole): boolean {
  return role === "manager" || role === "admin"
}
