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
import type { MemberNoticePublic } from "@/lib/notices-types"

type NoticesContextValue = {
  homePreview: MemberNoticePublic[]
  isLoading: boolean
  refreshHomePreview: () => Promise<void>
}

const NoticesContext = createContext<NoticesContextValue | null>(null)

export function NoticesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [homePreview, setHomePreview] = useState<MemberNoticePublic[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const refreshHomePreview = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/notices?preview=1")
      const data = (await res.json()) as { ok: boolean; notices?: MemberNoticePublic[] }
      if (data.ok && data.notices) {
        setHomePreview(data.notices)
      } else {
        setHomePreview([])
      }
    } catch (error) {
      console.error("[NoticesProvider]", error)
      setHomePreview([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated) {
      void refreshHomePreview()
    }
  }, [isAuthenticated, refreshHomePreview])

  const value = useMemo(
    () => ({ homePreview, isLoading, refreshHomePreview }),
    [homePreview, isLoading, refreshHomePreview],
  )

  return <NoticesContext.Provider value={value}>{children}</NoticesContext.Provider>
}

export function useNotices() {
  const ctx = useContext(NoticesContext)
  if (!ctx) {
    throw new Error("useNotices must be used within NoticesProvider")
  }
  return ctx
}
