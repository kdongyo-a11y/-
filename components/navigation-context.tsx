"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { TabKey } from "@/components/app-shell"

type NavigationContextValue = {
  navigate: (tab: TabKey) => void
}

const NavigationContext = createContext<NavigationContextValue | null>(null)

export function NavigationProvider({
  children,
  navigate,
}: {
  children: ReactNode
  navigate: (tab: TabKey) => void
}) {
  return (
    <NavigationContext.Provider value={{ navigate }}>{children}</NavigationContext.Provider>
  )
}

export function useNavigation() {
  const ctx = useContext(NavigationContext)
  if (!ctx) throw new Error("useNavigation must be used within NavigationProvider")
  return ctx
}
