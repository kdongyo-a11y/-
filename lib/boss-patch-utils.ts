import type { SlotCheck } from "@/components/participation-context"
import type { SlotAdminFlags } from "@/lib/boss-admin-status"
import { DEFAULT_SLOT_ADMIN_FLAGS } from "@/lib/boss-admin-status"
import type { BossSlotPatchResponse } from "@/lib/home-bootstrap-types"

export type BossPatchLevel = "tiny" | "attendee" | "full"

function createEmptyCheck(slotId: string): SlotCheck {
  return {
    slotId,
    code: "",
    status: "idle",
    startedAt: null,
    closedAt: null,
    attendees: [],
    adminLogs: [],
    extraMainBosses: [],
  }
}

function ensureCheck(checks: Record<string, SlotCheck>, slotId: string): SlotCheck {
  return checks[slotId] ?? createEmptyCheck(slotId)
}

/** Shallow-merge slot patches — supports partial SlotCheck fields (tiny patch). */
export function mergeBossSlotPatch(
  prevChecks: Record<string, SlotCheck>,
  prevFlags: Record<string, SlotAdminFlags>,
  patch: BossSlotPatchResponse,
): {
  checks: Record<string, SlotCheck>
  slotAdminFlags: Record<string, SlotAdminFlags>
} {
  const checks = { ...prevChecks }
  for (const [slotId, partial] of Object.entries(patch.checks)) {
    const id = partial.slotId ?? slotId
    checks[id] = { ...ensureCheck(prevChecks, id), ...partial, slotId: id }
  }

  const slotAdminFlags = { ...prevFlags }
  for (const [slotId, partial] of Object.entries(patch.slotAdminFlags)) {
    slotAdminFlags[slotId] = {
      ...(prevFlags[slotId] ?? DEFAULT_SLOT_ADMIN_FLAGS),
      ...partial,
    }
  }

  return { checks, slotAdminFlags }
}

export function buildTinyExtraBossesPatch(
  slotId: string,
  extraMainBosses: string[],
): BossSlotPatchResponse {
  return {
    checks: { [slotId]: { slotId, extraMainBosses } },
    slotAdminFlags: {},
  }
}

export function buildTinyCodePatch(slotId: string, code: string): BossSlotPatchResponse {
  return {
    checks: { [slotId]: { slotId, code } },
    slotAdminFlags: {},
  }
}

export function buildTinyIncomeFlagsPatch(
  slotId: string,
  incomeStatus: "no_income" | "income_declared" | "unprocessed",
): BossSlotPatchResponse {
  return {
    checks: {},
    slotAdminFlags: {
      [slotId]: {
        noIncomeClosed: incomeStatus === "no_income",
        incomeDeclared: incomeStatus === "income_declared",
      },
    },
  }
}
