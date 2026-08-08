"use client"

import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import type { GameServerListItem } from "@/lib/game-server-types"
import { cn } from "@/lib/utils"

type GameServersState = {
  servers: GameServerListItem[]
  loading: boolean
  error: string | null
  reason: string | null
}

export function useGameServers() {
  const [state, setState] = useState<GameServersState>({
    servers: [],
    loading: true,
    error: null,
    reason: null,
  })

  useEffect(() => {
    let cancelled = false

    void fetch("/api/game-servers")
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean
          servers?: GameServerListItem[]
          message?: string
          reason?: string
        }
        if (cancelled) return

        if (!res.ok || !data.ok) {
          setState({
            servers: [],
            loading: false,
            error: data.message ?? "서버 목록을 불러오지 못했습니다.",
            reason: data.reason ?? null,
          })
          return
        }

        const servers = data.servers ?? []
        if (servers.length === 0) {
          setState({
            servers: [],
            loading: false,
            error: "서버 목록을 불러오지 못했습니다.",
            reason: "empty",
          })
          return
        }

        setState({
          servers,
          loading: false,
          error: null,
          reason: null,
        })
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            servers: [],
            loading: false,
            error: "서버 목록을 불러오지 못했습니다.",
            reason: "network_error",
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export function GameServerSelect({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (serverId: string) => void
  disabled?: boolean
}) {
  const { servers, loading, error } = useGameServers()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selectDisabled = disabled || loading || !!error || servers.length === 0
  const selected = servers.find((s) => s.id === value)

  const placeholder = loading
    ? "서버 목록 불러오는 중…"
    : error
      ? "서버를 선택할 수 없습니다"
      : "서버 선택"

  useEffect(() => {
    if (!open) return

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [open])

  useEffect(() => {
    if (selectDisabled) setOpen(false)
  }, [selectDisabled])

  return (
    <div ref={rootRef} className="relative">
      <label className="block text-xs font-medium text-muted-foreground">
        서버
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          disabled={selectDisabled}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "mt-1 flex w-full items-center justify-between rounded-xl border border-border bg-input px-3 py-3 text-left text-sm text-foreground disabled:opacity-70",
            open && "ring-2 ring-ring/40",
          )}
        >
          <span className={cn(!selected && "text-muted-foreground")}>
            {selected?.name ?? placeholder}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </label>

      {open && !selectDisabled && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-lg"
        >
          {servers.map((server) => {
            const isSelected = server.id === value
            return (
              <li key={server.id} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={cn(
                    "w-full px-3 py-2.5 text-left text-sm text-card-foreground transition-colors",
                    "hover:bg-accent hover:text-accent-foreground",
                    isSelected && "bg-accent/70 font-medium text-accent-foreground",
                  )}
                  onClick={() => {
                    onChange(server.id)
                    setOpen(false)
                  }}
                >
                  {server.name}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {error && (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
