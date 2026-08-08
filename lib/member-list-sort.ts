import type { Member } from "@/lib/member-types"

export type MemberSortOption = "joinDate" | "level" | "contribution"

export const MEMBER_SORT_OPTIONS: { value: MemberSortOption; label: string }[] = [
  { value: "joinDate", label: "최근 가입순" },
  { value: "level", label: "레벨 높은순" },
  { value: "contribution", label: "기여도 높은순" },
]

export function normalizeMemberJoinDate(value: string): string {
  return value.slice(0, 10)
}

export function getMemberLevel(member: Member): number {
  const n = Number(member.level)
  return Number.isFinite(n) ? n : 0
}

export function sortMembers(
  members: Member[],
  sortBy: MemberSortOption,
  contributionByMemberId: ReadonlyMap<string, number>,
): Member[] {
  const compareJoinDateDesc = (a: Member, b: Member) => {
    const diff = normalizeMemberJoinDate(b.joinDate).localeCompare(
      normalizeMemberJoinDate(a.joinDate),
    )
    if (diff !== 0) return diff
    return a.nickname.localeCompare(b.nickname, "ko")
  }

  const compareLevelDesc = (a: Member, b: Member) => {
    const diff = getMemberLevel(b) - getMemberLevel(a)
    if (diff !== 0) return diff
    return compareJoinDateDesc(a, b)
  }

  const compareContributionDesc = (a: Member, b: Member) => {
    const ca = contributionByMemberId.get(a.id) ?? 0
    const cb = contributionByMemberId.get(b.id) ?? 0
    if (cb !== ca) return cb - ca
    return compareLevelDesc(a, b)
  }

  const sorted = [...members]
  sorted.sort((a, b) => {
    if (sortBy === "level") return compareLevelDesc(a, b)
    if (sortBy === "contribution") return compareContributionDesc(a, b)
    return compareJoinDateDesc(a, b)
  })
  return sorted
}
