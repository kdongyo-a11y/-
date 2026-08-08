import type { SupabaseClient } from "@supabase/supabase-js"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  sanitizeUsageMetadata,
  type RecordUsageEventInput,
  type UsageEventType,
} from "@/lib/platform/usage-event-types"

let forceFailForTesting = false

/** Phase 8 verify P9 — usage event INSERT 실패 시뮬레이션 */
export function setUsageEventForceFailForTesting(value: boolean): void {
  forceFailForTesting = value
}

/**
 * Best-effort usage event 기록 — 실패해도 caller flow를 중단하지 않음.
 * guild_id / member_id는 session/actor에서만 결정 (client input 금지).
 */
export async function recordUsageEvent(
  input: RecordUsageEventInput,
  adminClient?: SupabaseClient,
): Promise<void> {
  if (forceFailForTesting) {
    console.warn("[usage-events] force-fail test mode — skipping insert")
    return
  }

  try {
    const admin = adminClient ?? createAdminClient()
    const metadata = sanitizeUsageMetadata(input.metadata)

    const { error } = await admin.from("usage_events").insert({
      event_type: input.eventType,
      guild_id: input.guildId ?? null,
      member_id: input.memberId ?? null,
      metadata,
    })

    if (error) {
      console.warn("[usage-events] insert failed (non-blocking):", {
        eventType: input.eventType,
        code: error.code,
        message: error.message,
      })
    }
  } catch (error) {
    console.warn("[usage-events] unexpected error (non-blocking):", {
      eventType: input.eventType,
      error,
    })
  }
}

export async function recordUsageEventFromActor(
  eventType: UsageEventType,
  actor: { id: string; guild_id: string },
  metadata?: RecordUsageEventInput["metadata"],
  adminClient?: SupabaseClient,
): Promise<void> {
  await recordUsageEvent(
    {
      eventType,
      guildId: actor.guild_id,
      memberId: actor.id,
      metadata,
    },
    adminClient,
  )
}

export async function recordUsageEventForGuild(
  eventType: UsageEventType,
  guildId: string,
  memberId?: string | null,
  metadata?: RecordUsageEventInput["metadata"],
  adminClient?: SupabaseClient,
): Promise<void> {
  await recordUsageEvent(
    {
      eventType,
      guildId,
      memberId: memberId ?? null,
      metadata,
    },
    adminClient,
  )
}
