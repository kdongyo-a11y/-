"use client"

import { useCallback, useEffect, useState } from "react"
import type { GuildOperationSettings } from "@/lib/operation-settings-types"
import { DEFAULT_GUILD_OPERATION_SETTINGS } from "@/lib/operation-settings-utils"

export function useGuildOperationSettings() {
  const [settings, setSettings] = useState<GuildOperationSettings>({
    ...DEFAULT_GUILD_OPERATION_SETTINGS,
    updatedAt: null,
  })
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/operation-settings")
    const data = (await res.json()) as {
      ok: boolean
      settings?: GuildOperationSettings
    }
    if (data.ok && data.settings) {
      setSettings(data.settings)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { settings, loading, refresh }
}
