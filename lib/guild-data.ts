// 실제 DB 연결 전, 화면 구현용 목업 데이터입니다.

export { DEFAULT_GUILD_NAME as GUILD_NAME } from "@/lib/guild-profile-constants"

export type BossStatus = "예정" | "진행중" | "종료"

export type Boss = {
  id: string
  name: string
  location: string
  time: string // "20:30"
  status: BossStatus
  joined: boolean
  participants: number
  reward: string // 예상 분배금 표기
}

export type BossRecord = {
  id: string
  bossName: string
  date: string // "2026-08-05"
  time: string
  result: "참여" | "미참여" | "결석"
  payout: number // 이번 회차 분배금
}

export type LedgerEntry = {
  id: string
  date: string
  type: "수입" | "지출"
  category: string
  memo: string
  amount: number // 양수: 수입, 음수: 지출 (표시용 절대값)
}

export type Member = {
  id: string
  name: string
  role: "혈맹장" | "부혈맹장" | "혈원"
  bossCount: number
  duesPaid: boolean
  totalPayout: number
}

export const currentUser = {
  id: "u-102",
  name: "홍길동",
  role: "혈원" as Member["role"],
  className: "다크나이트 · Lv.62",
  monthlyBossCount: 14,
  totalPayout: 8_420_000,
  duesPaid: true,
  duesAmount: 500_000,
  duesDueDate: "2026-08-10",
}

// 관리자 화면 확인용 토글 (실제 로그인 연동 전 UI 데모)
export const guildFund = 42_680_000

export const todayBosses: Boss[] = [
  {
    id: "b-1",
    name: "발라카스",
    location: "화룡의 둥지",
    time: "20:30",
    status: "예정",
    joined: true,
    participants: 18,
    reward: "약 1,200,000",
  },
  {
    id: "b-2",
    name: "안타라스",
    location: "지하 3층",
    time: "21:00",
    status: "예정",
    joined: false,
    participants: 11,
    reward: "약 850,000",
  },
  {
    id: "b-3",
    name: "린드비오르",
    location: "얼음 협곡",
    time: "22:30",
    status: "예정",
    joined: false,
    participants: 7,
    reward: "약 640,000",
  },
  {
    id: "b-4",
    name: "쿠엔티스",
    location: "봉인의 탑",
    time: "18:00",
    status: "종료",
    joined: true,
    participants: 22,
    reward: "확정 980,000",
  },
]

export const bossRecords: BossRecord[] = [
  { id: "r-1", bossName: "쿠엔티스", date: "2026-08-06", time: "18:00", result: "참여", payout: 980_000 },
  { id: "r-2", bossName: "발라카스", date: "2026-08-05", time: "20:30", result: "참여", payout: 1_100_000 },
  { id: "r-3", bossName: "안타라스", date: "2026-08-05", time: "21:00", result: "미참여", payout: 0 },
  { id: "r-4", bossName: "린드비오르", date: "2026-08-04", time: "22:30", result: "참여", payout: 620_000 },
  { id: "r-5", bossName: "발라카스", date: "2026-08-03", time: "20:30", result: "결석", payout: 0 },
  { id: "r-6", bossName: "쿠엔티스", date: "2026-08-02", time: "18:00", result: "참여", payout: 910_000 },
]

export const ledger: LedgerEntry[] = [
  { id: "l-1", date: "2026-08-06", type: "수입", category: "보스 드랍 판매", memo: "쿠엔티스 무기", amount: 3_200_000 },
  { id: "l-2", date: "2026-08-05", type: "지출", category: "분배금", memo: "발라카스 회차 분배", amount: 4_400_000 },
  { id: "l-3", date: "2026-08-04", type: "수입", category: "혈비", memo: "8월 혈비 (32명)", amount: 16_000_000 },
  { id: "l-4", date: "2026-08-03", type: "지출", category: "물약 지원", memo: "공성전 물약 구매", amount: 1_800_000 },
  { id: "l-5", date: "2026-08-02", type: "수입", category: "보스 드랍 판매", memo: "안타라스 방어구", amount: 2_100_000 },
]

export const members: Member[] = [
  { id: "u-101", name: "관리자킹", role: "혈맹장", bossCount: 22, duesPaid: true, totalPayout: 12_300_000 },
  { id: "u-102", name: "홍길동", role: "혈원", bossCount: 14, duesPaid: true, totalPayout: 8_420_000 },
  { id: "u-103", name: "달빛기사", role: "부혈맹장", bossCount: 19, duesPaid: true, totalPayout: 10_100_000 },
  { id: "u-104", name: "그림자", role: "혈원", bossCount: 6, duesPaid: false, totalPayout: 3_200_000 },
  { id: "u-105", name: "붉은장미", role: "혈원", bossCount: 11, duesPaid: true, totalPayout: 6_800_000 },
  { id: "u-106", name: "천둥", role: "혈원", bossCount: 3, duesPaid: false, totalPayout: 1_400_000 },
]

export function formatWon(value: number): string {
  return value.toLocaleString("ko-KR") + "원"
}

export function formatWonShort(value: number): string {
  if (value >= 100_000_000) return (value / 100_000_000).toFixed(2).replace(/\.00$/, "") + "억"
  if (value >= 10_000) return Math.round(value / 10_000).toLocaleString("ko-KR") + "만"
  return value.toLocaleString("ko-KR")
}
