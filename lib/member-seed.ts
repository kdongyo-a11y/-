import type { Member, MemberCharacterClass } from "@/lib/member-types"
import { MEMBER_CHARACTER_CLASSES } from "@/lib/member-types"

const MOCK_GUILD_ID = "00000000-0000-0000-0000-000000000001"

const CORE: Member[] = [
  {
    id: "u-101",
    guildId: MOCK_GUILD_ID,
    nickname: "관리자킹",
    characterClass: "군주",
    level: 72,
    position: "군주",
    joinDate: "2025-03-01",
    status: "활동",
    role: "admin",
  },
  {
    id: "u-102",
    guildId: MOCK_GUILD_ID,
    nickname: "홍길동",
    characterClass: "기사",
    level: 62,
    position: "일반",
    joinDate: "2026-01-10",
    status: "활동",
    role: "member",
  },
  {
    id: "u-103",
    guildId: MOCK_GUILD_ID,
    nickname: "달빛기사",
    characterClass: "기사",
    level: 68,
    position: "부군주",
    joinDate: "2025-06-15",
    status: "활동",
    role: "manager",
  },
  {
    id: "u-104",
    guildId: MOCK_GUILD_ID,
    nickname: "그림자",
    characterClass: "요정",
    level: 55,
    position: "일반",
    joinDate: "2026-03-20",
    status: "활동",
    role: "member",
  },
  {
    id: "u-105",
    guildId: MOCK_GUILD_ID,
    nickname: "붉은장미",
    characterClass: "요정",
    level: 60,
    position: "운영진",
    joinDate: "2025-11-02",
    status: "활동",
    role: "manager",
  },
  {
    id: "u-106",
    guildId: MOCK_GUILD_ID,
    nickname: "천둥",
    characterClass: "마법사",
    level: 58,
    position: "일반",
    joinDate: "2026-05-01",
    status: "활동",
    role: "member",
  },
]

function generateExtraMembers(): Member[] {
  const extras: Member[] = []
  const names = [
    "바람의검",
    "은빛방패",
    "불꽃술사",
    "그린아처",
    "블랙위저드",
    "실버나이트",
    "골든힐",
    "아이스퀸",
    "썬더볼트",
    "다크소울",
    "화이트랜스",
    "레드소드",
    "블루매직",
    "섀도우킬",
    "라이트헌터",
    "문라이트",
    "스톰브링어",
    "드래곤슬레이",
    "피닉스날개",
    "크리스탈",
  ]

  for (let i = 0; i < 74; i++) {
    const id = `u-${200 + i}`
    const name = names[i % names.length] + (i >= names.length ? String(i - names.length + 1) : "")
    let status: Member["status"] = "활동"
    if (i >= 58 && i < 60) status = "휴면"
    else if (i >= 60) status = "탈퇴"

    const characterClass: MemberCharacterClass =
      MEMBER_CHARACTER_CLASSES[i % MEMBER_CHARACTER_CLASSES.length]

    extras.push({
      id,
      guildId: MOCK_GUILD_ID,
      nickname: name,
      characterClass,
      level: 50 + (i % 20),
      position: i === 0 ? "운영진" : "일반",
      joinDate: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      status,
      role: "member",
    })
  }

  return extras
}

export const INITIAL_MEMBERS: Member[] = [...CORE, ...generateExtraMembers()]

export function getMemberStats(members: Member[]) {
  let active = 0
  let dormant = 0
  let withdrawn = 0
  let managers = 0

  for (const m of members) {
    if (m.status === "활동") active++
    else if (m.status === "휴면") dormant++
    else withdrawn++
    if (m.role === "manager" || m.role === "admin") managers++
  }

  return {
    total: members.length,
    active,
    dormant,
    withdrawn,
    managers,
  }
}
