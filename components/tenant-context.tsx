"use client"

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react"
import type { Guild } from "@/lib/guild-types"
import { useAuth } from "@/components/auth-context"
import { useGuildProfile } from "@/components/guild-profile-context"

type TenantContextValue = {
  guild: Guild | null
  guildId: string | null
  guildName: string | null
  serverId: string | null
  serverName: string | null
  guildMarkUrl: string | null
  isLoading: boolean
  refreshGuild: () => Promise<void>
}

const TenantContext = createContext<TenantContextValue | null>(null)

export function TenantProvider({ children }: { children: ReactNode }) {
  const { currentMember, isAuthenticated } = useAuth()
  const { profile, isLoading, isProfilePending, refreshProfile } = useGuildProfile()

  const guildId = isAuthenticated ? (currentMember?.guildId ?? null) : null
  const tenantLoading = isAuthenticated && isProfilePending

  const guild = useMemo((): Guild | null => {
    if (!guildId || !profile?.guildName || !profile.serverId) return null
    return {
      id: guildId,
      serverId: profile.serverId,
      guildName: profile.guildName,
      guildCode: "",
      guildMarkPath: profile.guildMarkPath,
      status: "active",
      onboardingCompleted: false,
    }
  }, [guildId, profile?.guildName, profile?.serverId, profile?.guildMarkPath])

  const value = useMemo<TenantContextValue>(
    () => ({
      guild,
      guildId,
      guildName: profile?.guildName ?? null,
      serverId: profile?.serverId ?? null,
      serverName: profile?.serverName ?? null,
      guildMarkUrl: profile?.guildMarkUrl ?? null,
      isLoading: tenantLoading,
      refreshGuild: refreshProfile,
    }),
    [guild, guildId, profile, tenantLoading, refreshProfile],
  )

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (!ctx) throw new Error("useTenant must be used within TenantProvider")
  return ctx
}

export function useOptionalTenantGuildName(): string | null {
  const ctx = useContext(TenantContext)
  return ctx?.guildName ?? null
}

export function useOptionalTenant() {
  return useContext(TenantContext)
}
