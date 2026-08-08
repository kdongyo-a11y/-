import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PlatformLoginView } from "@/components/platform/platform-login-view"
import { requirePlatformAdmin } from "@/lib/platform/platform-admin-auth"

export const metadata = {
  title: "Platform Admin · 로그인",
}

export default async function PlatformLoginPage() {
  const ctx = await requirePlatformAdmin()
  if (ctx.ok) {
    redirect("/platform")
  }

  return (
    <Suspense fallback={null}>
      <PlatformLoginView />
    </Suspense>
  )
}
