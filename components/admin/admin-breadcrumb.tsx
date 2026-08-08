"use client"

import { ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

export type BreadcrumbItem = {
  label: string
  onClick?: () => void
}

export function AdminBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={`${item.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />}
            {item.onClick && !isLast ? (
              <button
                type="button"
                onClick={item.onClick}
                className="font-medium text-primary transition-opacity hover:opacity-80"
              >
                {item.label}
              </button>
            ) : (
              <span className={cn(isLast && "font-semibold text-foreground")}>{item.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
