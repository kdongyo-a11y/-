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
import type { MemberOperationPolicyPublicView } from "@/lib/operation-policy-display-utils"

type OperationPolicyContextValue = {
  policyView: MemberOperationPolicyPublicView | null
  isLoading: boolean
  refreshPolicyView: () => Promise<void>
}

const OperationPolicyContext = createContext<OperationPolicyContextValue | null>(null)

const EMPTY_VIEW: MemberOperationPolicyPublicView = {
  currentPolicy: null,
  nextScheduledPolicy: null,
  nextScheduledChangeLines: [],
  scheduledPolicies: [],
  additionalScheduledCount: 0,
}

export function OperationPolicyProvider({
  children,
  initialPolicyView,
  skipInitialFetch = false,
}: {
  children: ReactNode
  initialPolicyView?: MemberOperationPolicyPublicView
  skipInitialFetch?: boolean
}) {
  const { isAuthenticated } = useAuth()
  const [policyView, setPolicyView] = useState<MemberOperationPolicyPublicView | null>(
    initialPolicyView ?? null,
  )
  const [isLoading, setIsLoading] = useState(false)

  const refreshPolicyView = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/operation-policy")
      const data = (await res.json()) as {
        ok: boolean
        policyView?: MemberOperationPolicyPublicView
      }
      if (data.ok && data.policyView) {
        setPolicyView(data.policyView)
      } else {
        setPolicyView(EMPTY_VIEW)
      }
    } catch (error) {
      console.error("[OperationPolicyProvider]", error)
      setPolicyView(EMPTY_VIEW)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (skipInitialFetch) return
    if (isAuthenticated) {
      void refreshPolicyView()
    }
  }, [isAuthenticated, refreshPolicyView, skipInitialFetch])

  const value = useMemo(
    () => ({ policyView, isLoading, refreshPolicyView }),
    [policyView, isLoading, refreshPolicyView],
  )

  return (
    <OperationPolicyContext.Provider value={value}>
      {children}
    </OperationPolicyContext.Provider>
  )
}

export function useOperationPolicy() {
  const ctx = useContext(OperationPolicyContext)
  if (!ctx) {
    throw new Error("useOperationPolicy must be used within OperationPolicyProvider")
  }
  return ctx
}
