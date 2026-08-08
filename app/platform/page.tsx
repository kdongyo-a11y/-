import { redirect } from "next/navigation"
import { PlatformDashboardView } from "@/components/platform/platform-dashboard-view"
import { requirePlatformAdmin } from "@/lib/platform/platform-admin-auth"

export const metadata = {
  title: "Platform Admin · 서비스 운영 현황",
}

export default async function PlatformPage() {
  const ctx = await requirePlatformAdmin()

  if (!ctx.ok) {
    if (ctx.status === 401) {
      redirect("/platform/login")
    }
    redirect("/platform/login?error=forbidden")
  }

  return <PlatformDashboardView displayName={ctx.platformAdmin.display_name} />
}
