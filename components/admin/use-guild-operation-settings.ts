"use client"

import { useCallback, useEffect, useState } from "react"
import type { GuildOperationPolicyView, GuildOperationSettings } from "@/lib/operation-settings-types"
import { DEFAULT_GUILD_OPERATION_SETTINGS } from "@/lib/operation-settings-utils"

export function useGuildOperationSettings(occurredAtIso?: string | null) {
  const [settings, setSettings] = useState<GuildOperationSettings>({
    ...DEFAULT_GUILD_OPERATION_SETTINGS,
    updatedAt: null,
  })
  const [policyView, setPolicyView] = useState<GuildOperationPolicyView | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const query = occurredAtIso ? `?occurredAt=${encodeURIComponent(occurredAtIso)}` : ""
    const res = await fetch(`/api/admin/operation-settings${query}`)
    const data = (await res.json()) as {
      ok: boolean
      settings?: GuildOperationSettings
      policyView?: GuildOperationPolicyView
    }
    if (data.ok && data.settings) {
      setSettings(data.settings)
      setPolicyView(data.policyView ?? null)
    }
    setLoading(false)
  }, [occurredAtIso])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { settings, policyView, loading, refresh }
}
