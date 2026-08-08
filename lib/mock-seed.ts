import { getTodayDateString, makeSlotId } from "@/lib/boss-time-slots"

/** 테스트용 06:00 보스타임 slot id */
export function getMockSixAmSlotId(): string {
  return makeSlotId(getTodayDateString(), 6)
}

/** 홍길동 테스트용 분배금 (1인 정산) */
export const MOCK_PAYOUT_AMOUNT = 1_633_333

export const MOCK_DUES_BILL_ID = "dues-2026-08"
