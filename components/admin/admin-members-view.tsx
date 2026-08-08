"use client"

import type { AdminNavState } from "@/components/admin/admin-types"
import { AdminMembersListView } from "@/components/admin/admin-members-list-view"
import { AdminMemberDetailView } from "@/components/admin/admin-member-detail-view"

type Props = {
  memberId?: string
  onNavigate: (nav: AdminNavState) => void
}

/** Hook 없는 라우터 — 목록/상세를 독립 컴포넌트로 분리 */
export function AdminMembersView({ memberId, onNavigate }: Props) {
  if (memberId) {
    return <AdminMemberDetailView memberId={memberId} onNavigate={onNavigate} />
  }
  return <AdminMembersListView onNavigate={onNavigate} />
}
