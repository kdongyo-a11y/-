import type { MemberRow } from "@/lib/supabase/member-mapper"

export function isManagerOrAdmin(role: MemberRow["role"]): boolean {
  return role === "manager" || role === "admin"
}

export function requireManagerOrAdmin(
  member: MemberRow,
): { ok: true } | { ok: false; message: string; status: number } {
  if (!isManagerOrAdmin(member.role)) {
    return { ok: false, message: "관리자 권한이 필요합니다.", status: 403 }
  }
  return { ok: true }
}

export function requireAdmin(
  member: MemberRow,
): { ok: true } | { ok: false; message: string; status: number } {
  if (member.role !== "admin") {
    return { ok: false, message: "최고관리자 권한이 필요합니다.", status: 403 }
  }
  return { ok: true }
}
