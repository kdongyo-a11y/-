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
import type { HomeBootstrapPayload } from "@/lib/home-bootstrap-types"

type HomeBootstrapContextValue = {
  bootstrap: HomeBootstrapPayload | null
  isLoading: boolean
  loadError: string | null
  reload: () => Promise<void>
}

const HomeBootstrapContext = createContext<HomeBootstrapContextValue | null>(null)

export function HomeBootstrapProvider({ children }: { children: ReactNode }) {
  const [bootstrap, setBootstrap] = useState<HomeBootstrapPayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/bootstrap/home", { cache: "no-store" })
      const data = (await res.json()) as {
        ok: boolean
        bootstrap?: HomeBootstrapPayload
        message?: string
      }
      if (!res.ok || !data.ok || !data.bootstrap) {
        setBootstrap(null)
        setLoadError(data.message ?? "홈 데이터를 불러오지 못했습니다.")
        return
      }
      setBootstrap(data.bootstrap)
    } catch (error) {
      console.error("[HomeBootstrapProvider]", error)
      setBootstrap(null)
      setLoadError("홈 데이터를 불러오지 못했습니다.")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo(
    () => ({ bootstrap, isLoading, loadError, reload }),
    [bootstrap, isLoading, loadError, reload],
  )

  return (
    <HomeBootstrapContext.Provider value={value}>{children}</HomeBootstrapContext.Provider>
  )
}

export function useHomeBootstrap() {
  const ctx = useContext(HomeBootstrapContext)
  if (!ctx) {
    throw new Error("useHomeBootstrap must be used within HomeBootstrapProvider")
  }
  return ctx
}

export function useOptionalHomeBootstrap() {
  return useContext(HomeBootstrapContext)
}
