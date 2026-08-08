import type { Member, MemberCharacterClass } from "@/lib/member-types"

export function formatMemberProfile(member: Pick<Member, "characterClass" | "level">): string {
  return `${member.characterClass} · Lv.${member.level}`
}

export function isValidMemberLevel(level: number): boolean {
  return Number.isInteger(level) && level >= 1 && level <= 999
}

export function parseLegacyClassName(
  legacy: string,
): Pick<Member, "characterClass" | "level"> {
  const match = legacy.match(/^(.+?)\s*·\s*Lv\.(\d+)$/i)
  const rawClass = match?.[1]?.trim() ?? legacy.trim()
  const level = match?.[2] ? parseInt(match[2], 10) : 50

  const map: Record<string, MemberCharacterClass> = {
    군주: "군주",
    기사: "기사",
    마법사: "마법사",
    요정: "요정",
    다크나이트: "기사",
    다크엘프: "요정",
    용기사: "기사",
    환술사: "마법사",
  }

  const characterClass = map[rawClass] ?? "기사"
  return { characterClass, level: isValidMemberLevel(level) ? level : 50 }
}
