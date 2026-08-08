"use client"

import { Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { SAAS_SERVICE_NAME } from "@/lib/guild-profile-constants"

const sizeClasses = {
  sm: "h-8 w-8 rounded-lg",
  md: "h-14 w-14 rounded-2xl",
  lg: "h-20 w-20 rounded-2xl",
} as const

/** 로그인 전 SaaS 공용 branding — 특정 guild asset 사용 금지 */
export function ServiceBranding({
  size = "md",
  className,
  showTitle = true,
}: {
  size?: keyof typeof sizeClasses
  className?: string
  showTitle?: boolean
}) {
  return (
    <div className={cn("text-center", className)}>
      <div
        className={cn(
          "mx-auto flex items-center justify-center border border-border/40 bg-muted text-muted-foreground",
          sizeClasses[size],
        )}
      >
        <Shield className={size === "sm" ? "h-4 w-4" : "h-7 w-7"} strokeWidth={1.8} />
      </div>
      {showTitle && (
        <>
          <h1 className="mt-4 text-xl font-semibold text-foreground">{SAAS_SERVICE_NAME}</h1>
          <p className="mt-1 text-sm text-muted-foreground">서버 · 혈맹코드 · 캐릭터명으로 로그인</p>
        </>
      )}
    </div>
  )
}
