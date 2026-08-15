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
import { useAuth } from "@/components/auth-context"
import {
  resolveContributionScoresForDate,
  type ContributionScoreSetting,
  type ContributionScoreValues,
} from "@/lib/contribution-score-settings"

type ContributionSettingsContextValue = {
  settings: ContributionScoreSetting[]
  isLoading: boolean
  refreshSettings: () => Promise<void>
  getScoresForDate: (eventDate: string) => ContributionScoreValues
}

const ContributionSettingsContext = createContext<ContributionSettingsContextValue | null>(null)

export function ContributionSettingsProvider({
  children,
  initialSettings,
  skipInitialFetch = false,
}: {
  children: ReactNode
  initialSettings?: ContributionScoreSetting[]
  skipInitialFetch?: boolean
}) {
  const { isAuthenticated } = useAuth()
  const [settings, setSettings] = useState<ContributionScoreSetting[]>(initialSettings ?? [])
  const [isLoading, setIsLoading] = useState(false)

  const refreshSettings = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/admin/contribution-settings")
      const data = (await res.json()) as {
        ok: boolean
        settings?: ContributionScoreSetting[]
      }
      if (data.ok && data.settings) {
        setSettings(data.settings)
      }
    } catch (error) {
      console.error("[ContributionSettingsProvider]", error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (skipInitialFetch) return
    if (isAuthenticated) {
      void refreshSettings()
    }
  }, [isAuthenticated, refreshSettings, skipInitialFetch])

  const getScoresForDate = useCallback(
    (eventDate: string) => resolveContributionScoresForDate(settings, eventDate),
    [settings],
  )

  const value = useMemo(
    () => ({ settings, isLoading, refreshSettings, getScoresForDate }),
    [settings, isLoading, refreshSettings, getScoresForDate],
  )

  return (
    <ContributionSettingsContext.Provider value={value}>
      {children}
    </ContributionSettingsContext.Provider>
  )
}

export function useContributionSettings() {
  const ctx = useContext(ContributionSettingsContext)
  if (!ctx) {
    throw new Error("useContributionSettings must be used within ContributionSettingsProvider")
  }
  return ctx
}
