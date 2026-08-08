"use client"

import { useEffect } from "react"
import { useAuth } from "@/components/auth-context"
import { useGuildProfile } from "@/components/guild-profile-context"

/** AuthProvider 하위에서 로그인/로그아웃 시 guild profile fetch/clear 동기화 */
export function GuildProfileAuthSync() {
  const { isAuthenticated, isHydrated } = useAuth()
  const { refreshProfile, clearProfile } = useGuildProfile()

  useEffect(() => {
    if (!isHydrated) return
    if (isAuthenticated) {
      void refreshProfile()
    } else {
      clearProfile()
    }
  }, [isAuthenticated, isHydrated, refreshProfile, clearProfile])

  return null
}
