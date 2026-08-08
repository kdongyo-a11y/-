import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function SectionTitle({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="mb-2.5 mt-5 flex items-center justify-between first:mt-0">
      <h2 className="text-sm font-semibold text-foreground">{children}</h2>
      {action}
    </div>
  )
}

export function Card({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>{children}</div>
  )
}

type Tone = "neutral" | "primary" | "success" | "warning" | "danger"

const toneMap: Record<Tone, string> = {
  neutral: "bg-secondary text-muted-foreground",
  primary: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode
  tone?: Tone
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string
  value: string
  sub?: string
  tone?: Tone
  icon?: ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {icon ? (
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md", toneMap[tone])}>
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  )
}
