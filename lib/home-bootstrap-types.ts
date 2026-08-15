import type { SlotCheck } from "@/components/participation-context"
import type { SlotAdminFlags } from "@/lib/boss-admin-status"
import type { ContributionScoreSetting } from "@/lib/contribution-score-settings"
import type { DuesBill } from "@/lib/dues-types"
import type { MemberNoticePublic } from "@/lib/notices-types"
import type { MemberOperationPolicyPublicView } from "@/lib/operation-policy-display-utils"
import type { RosterMember } from "@/lib/member-types"
import type { SiegeEvent } from "@/components/siege-context"
import type { Settlement } from "@/lib/settlement-types"

export type HomeBootstrapPayload = {
  policyView: MemberOperationPolicyPublicView
  noticesPreview: MemberNoticePublic[]
  boss: {
    checks: Record<string, SlotCheck>
    slotAdminFlags: Record<string, SlotAdminFlags>
  }
  siege: {
    sieges: SiegeEvent[]
  }
  dues: {
    bills: DuesBill[]
  }
  contributionSettings: ContributionScoreSetting[]
  membersRoster: RosterMember[]
  settlementHome: {
    settlements: Record<string, Settlement>
  }
}

/** Partial slot fields allowed — client merges with existing check state. */
export type BossSlotPatchResponse = {
  checks: Record<string, Partial<SlotCheck> & { slotId?: string }>
  slotAdminFlags: Record<string, Partial<SlotAdminFlags>>
  patchLevel?: "tiny" | "attendee" | "full"
}
