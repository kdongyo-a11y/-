"use client"

import Image from "next/image"
import { Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { useOptionalTenant } from "@/components/tenant-context"

const sizeClasses = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-20 w-20 rounded-2xl",
} as const

export function ClanMark({
  size = "md",
  className,
  priority = false,
}: {
  size?: keyof typeof sizeClasses
  className?: string
  priority?: boolean
}) {
  const tenant = useOptionalTenant()
  const guildName = tenant?.guildName ?? ""
  const guildMarkUrl = tenant?.guildMarkUrl ?? null
  const isLoading = tenant?.isLoading ?? false

  if (isLoading) {
    return (
      <div
        className={cn(
          "relative shrink-0 overflow-hidden border border-border/40 bg-muted animate-pulse",
          sizeClasses[size],
          className,
        )}
        aria-hidden
      />
    )
  }

  if (!guildMarkUrl) {
    return (
      <div
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden border border-border/40 bg-muted text-muted-foreground",
          sizeClasses[size],
          className,
        )}
        aria-label={guildName ? `${guildName} 혈마크 placeholder` : "혈마크 placeholder"}
      >
        <Shield className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} strokeWidth={1.8} />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden border border-border/40 bg-black shadow-sm",
        sizeClasses[size],
        className,
      )}
    >
      <Image
        src={guildMarkUrl}
        alt={guildName ? `${guildName} 혈마크` : "혈마크"}
        fill
        className="object-cover"
        priority={priority}
        unoptimized
        sizes={size === "sm" ? "32px" : size === "lg" ? "80px" : "56px"}
      />
    </div>
  )
}
