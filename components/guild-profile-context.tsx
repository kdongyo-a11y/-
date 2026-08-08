"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import type { GuildProfileState } from "@/lib/supabase/guild-profile-data"
import { tryCreateClient } from "@/lib/supabase/client"

export type { GuildProfileState }

type GuildProfileContextValue = {
  profile: GuildProfileState | null
  isLoading: boolean
  isProfilePending: boolean
  refreshProfile: () => Promise<void>
  applyProfile: (next: Partial<GuildProfileState>) => void
  clearProfile: () => void
}

function parseApiProfile(data: {
  ok: boolean
  authenticated?: boolean
  guildName?: string
  serverId?: string
  serverName?: string
  guildMarkUrl?: string | null
  guildMarkPath?: string | null
  updatedAt?: string | null
}): GuildProfileState | null {
  if (!data.ok || !data.authenticated || !data.guildName) return null
  return {
    guildName: data.guildName,
    serverId: data.serverId ?? "",
    serverName: data.serverName ?? "",
    guildMarkUrl: data.guildMarkUrl ?? null,
    guildMarkPath: data.guildMarkPath ?? null,
    updatedAt: data.updatedAt ?? null,
  }
}

const GuildProfileContext = createContext<GuildProfileContextValue | null>(null)

export function GuildProfileProvider({
  children,
  initialProfile = null,
}: {
  children: ReactNode
  initialProfile?: GuildProfileState | null
}) {
  const [profile, setProfile] = useState<GuildProfileState | null>(initialProfile)
  const [isLoading, setIsLoading] = useState(initialProfile == null)
  const hasResolvedProfileRef = useRef(initialProfile != null)

  const clearProfile = useCallback(() => {
    setProfile(null)
    hasResolvedProfileRef.current = false
    setIsLoading(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    const silent = hasResolvedProfileRef.current
    if (!silent) setIsLoading(true)
    try {
      const res = await fetch("/api/guild-profile", { cache: "no-store" })
      const data = (await res.json()) as {
        ok: boolean
        authenticated?: boolean
        guildName?: string
        serverId?: string
        serverName?: string
        guildMarkUrl?: string | null
        guildMarkPath?: string | null
        updatedAt?: string | null
        message?: string
      }

      if (!res.ok || !data.ok) {
        setProfile(null)
        hasResolvedProfileRef.current = false
        if (!res.ok) {
          console.warn("[GuildProfileProvider] profile fetch failed:", data.message ?? res.status)
        }
        return
      }

      const next = parseApiProfile(data)
      if (next) {
        setProfile(next)
        hasResolvedProfileRef.current = true
      } else {
        setProfile(null)
        hasResolvedProfileRef.current = false
      }
    } catch (error) {
      console.error("[GuildProfileProvider]", error)
      setProfile(null)
      hasResolvedProfileRef.current = false
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [])

  const applyProfile = useCallback((next: Partial<GuildProfileState>) => {
    setProfile((prev) => {
      if (!prev) return prev
      return { ...prev, ...next }
    })
    hasResolvedProfileRef.current = true
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void refreshProfile()
  }, [refreshProfile])

  useEffect(() => {
    const supabase = tryCreateClient()
    if (!supabase) return
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        clearProfile()
        return
      }
      void refreshProfile()
    })
    return () => subscription.unsubscribe()
  }, [refreshProfile, clearProfile])

  const isProfilePending = isLoading && profile == null

  const value = useMemo(
    () => ({
      profile,
      isLoading,
      isProfilePending,
      refreshProfile,
      applyProfile,
      clearProfile,
    }),
    [profile, isLoading, isProfilePending, refreshProfile, applyProfile, clearProfile],
  )

  return (
    <GuildProfileContext.Provider value={value}>{children}</GuildProfileContext.Provider>
  )
}

export function useGuildProfile() {
  const ctx = useContext(GuildProfileContext)
  if (!ctx) {
    throw new Error("useGuildProfile must be used within GuildProfileProvider")
  }
  return ctx
}

export function GuildNameText({
  className,
  size = "sm",
}: {
  className?: string
  size?: "sm" | "lg"
}) {
  const { profile, isProfilePending } = useGuildProfile()
  if (isProfilePending) {
    return (
      <span
        className={
          className ??
          (size === "lg"
            ? "inline-block h-6 w-28 animate-pulse rounded bg-muted"
            : "inline-block h-3.5 w-20 animate-pulse rounded bg-muted")
        }
        aria-hidden
      />
    )
  }
  if (!profile?.guildName) return null
  return <span className={className}>{profile.guildName}</span>
}

export function ServerNameText({ className }: { className?: string }) {
  const { profile, isProfilePending } = useGuildProfile()
  if (isProfilePending) {
    return (
      <span
        className={className ?? "inline-block h-3 w-16 animate-pulse rounded bg-muted"}
        aria-hidden
      />
    )
  }
  if (!profile?.serverName) return null
  return <span className={className}>{profile.serverName} 서버</span>
}

/** @deprecated GuildNameText 사용 */
export function GuildCodeText(props: { className?: string; size?: "sm" | "lg" }) {
  return <GuildNameText {...props} />
}
