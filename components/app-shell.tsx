"use client"

import type { ReactNode } from "react"
import { Home, Swords, ScrollText, BookOpen, User, ShieldCheck } from "lucide-react"
import { useAuth } from "@/components/auth-context"
import { ClanMark } from "@/components/clan-mark"
import { useTenant } from "@/components/tenant-context"
import { cn } from "@/lib/utils"

export type TabKey = "home" | "boss" | "records" | "ledger" | "profile" | "admin"

const memberTabs: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: "home", label: "홈", icon: Home },
  { key: "boss", label: "보스", icon: Swords },
  { key: "records", label: "내 기록", icon: ScrollText },
  { key: "ledger", label: "혈맹장부", icon: BookOpen },
  { key: "profile", label: "내 정보", icon: User },
]

const adminTab = { key: "admin" as TabKey, label: "관리자", icon: ShieldCheck }

function AppShellHeader() {
  const { currentMember } = useAuth()
  const { guildName, serverName, isLoading } = useTenant()

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-2.5">
        <ClanMark size="sm" />
        <div className="leading-tight">
          {isLoading ? (
            <>
              <p className="text-sm font-semibold">
                <span className="inline-block h-3.5 w-20 animate-pulse rounded bg-muted" aria-hidden />
              </p>
              <p className="text-xs">
                <span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" aria-hidden />
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-foreground">{guildName}</p>
              <p className="text-xs text-muted-foreground">{serverName} 서버</p>
            </>
          )}
        </div>
      </div>

      {currentMember && (
        <p className="max-w-[120px] truncate text-xs text-muted-foreground">
          {currentMember.nickname}
        </p>
      )}
    </header>
  )
}

export function AppShell({
  children,
  active,
  onTabChange,
  title,
}: {
  children: ReactNode
  active: TabKey
  onTabChange: (tab: TabKey) => void
  title: string
}) {
  const { canAccessAdmin } = useAuth()
  const tabs = canAccessAdmin ? [...memberTabs, adminTab] : memberTabs

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-md flex-col bg-background">
      <AppShellHeader />

      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-4">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md border-t border-border bg-card/95 backdrop-blur">
        <ul
          className="grid"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map(({ key, label, icon: Icon }) => {
            const isActive = active === key
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onTabChange(key)}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="h-[env(safe-area-inset-bottom)]" />
      </nav>
    </div>
  )
}
