"use client"

import { useMemo } from "react"
import { useParticipation } from "@/components/participation-context"
import { useSettlement } from "@/components/settlement-context"
import {
  computeBossProcessStatus,
  type BossProcessStatus,
} from "@/lib/boss-admin-status"
import { generateDaySlots, type BossTimeSlot } from "@/lib/boss-time-slots"

export function useBossSlotStatus(slot: BossTimeSlot): BossProcessStatus {
  const { getCheck, getSlotAdminFlags, checks, slotAdminFlags } = useParticipation()
  const { getBossSettlement, settlements } = useSettlement()

  return useMemo(() => {
    const check = getCheck(slot.id)
    const settlement = getBossSettlement(slot.id)
    const flags = getSlotAdminFlags(slot.id)
    return computeBossProcessStatus({
      checkStatus: check.status,
      flags,
      hasSettlement: !!settlement,
      settlementParticipants: settlement?.participants ?? [],
    })
  }, [slot.id, checks, slotAdminFlags, settlements, getCheck, getSlotAdminFlags, getBossSettlement])
}

export function useBossDayStatuses(date: string) {
  const { getCheck, getSlotAdminFlags, checks, slotAdminFlags } = useParticipation()
  const { getBossSettlement, settlements } = useSettlement()

  return useMemo(() => {
    const slots = generateDaySlots(date)
    return slots.map((slot) => {
      const check = getCheck(slot.id)
      const settlement = getBossSettlement(slot.id)
      const flags = getSlotAdminFlags(slot.id)
      const status = computeBossProcessStatus({
        checkStatus: check.status,
        flags,
        hasSettlement: !!settlement,
        settlementParticipants: settlement?.participants ?? [],
      })
      return { slot, check, status }
    })
  }, [date, checks, slotAdminFlags, settlements, getCheck, getSlotAdminFlags, getBossSettlement])
}
