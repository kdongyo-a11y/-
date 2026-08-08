"use client"

import { useState } from "react"
import { useAuth } from "@/components/auth-context"
import { ADMIN_HOME, type AdminNavState } from "@/components/admin/admin-types"
import {
  AdminNoAccess,
  AdminSectionContent,
} from "@/components/admin/admin-section-content"

export function AdminScreen() {
  const { canAccessAdmin } = useAuth()
  const [nav, setNav] = useState<AdminNavState>(ADMIN_HOME)

  if (!canAccessAdmin) {
    return <AdminNoAccess />
  }

  return <AdminSectionContent nav={nav} onNavigate={setNav} />
}
