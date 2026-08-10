/**
 * Phase 9c — policy version / effective_from 검증
 * npm run phase9c:verify-operation-policy-versions
 */
import {
  kstLocalDateTimeToIso,
  isoToKstParts,
  isEffectiveFromAllowedForNewPolicy,
} from "../lib/operation-policy-kst-utils"
import {
  buildPolicySnapshotV1,
  getCurrentPolicyVersion,
  getNextScheduledPolicyVersion,
  selectPolicyVersionForOccurredAt,
  validateExtensiblePolicySnapshotStructure,
  type GuildOperationPolicyVersion,
} from "../lib/operation-policy-version-utils"
import { bossEventOccurredAtIso } from "../lib/event-occurred-at-utils"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function makeVersion(
  partial: Partial<GuildOperationPolicyVersion> &
    Pick<GuildOperationPolicyVersion, "version" | "effectiveFrom" | "policySnapshot">,
): GuildOperationPolicyVersion {
  return {
    id: partial.id ?? `v-${partial.version}`,
    guildId: "guild-1",
    createdAt: partial.createdAt ?? "2026-08-10T08:40:00.000Z",
    createdBy: null,
    changeReason: partial.changeReason ?? "test",
    cancelledAt: partial.cancelledAt ?? null,
    cancelledBy: null,
    cancelReason: null,
    ...partial,
  }
}

function financeSnapshot(mgmtPct: number, reservePct: number) {
  return buildPolicySnapshotV1({
    managementFeeMode: "percentage",
    managementFeePercentage: mgmtPct,
    reserveMode: "percentage",
    reservePercentage: reservePct,
    allocations: [{ memberId: "m1", ratioBp: 10000 }],
  })
}

function main() {
  const checks: Check[] = []

  const kstIso = kstLocalDateTimeToIso("2026-08-12", "00:00")
  const kstParts = isoToKstParts(kstIso)
  assert(checks, "C1-kst-conversion", kstParts.date === "2026-08-12" && kstParts.time === "00:00", kstIso)

  const now = new Date("2026-08-10T08:40:00.000Z")
  assert(
    checks,
    "C2-future-effective-ok",
    isEffectiveFromAllowedForNewPolicy("2026-08-13T00:00:00+09:00", now),
    "future allowed",
  )
  assert(
    checks,
    "C2-past-effective-reject",
    !isEffectiveFromAllowedForNewPolicy("2026-08-09T00:00:00+09:00", now),
    "past rejected",
  )

  const v1 = makeVersion({
    version: 1,
    effectiveFrom: "2000-01-01T00:00:00+09:00",
    policySnapshot: financeSnapshot(5, 10),
  })
  const v2 = makeVersion({
    version: 2,
    effectiveFrom: "2026-08-12T00:00:00+09:00",
    policySnapshot: financeSnapshot(7, 5),
  })
  const versions = [v1, v2]

  const beforeEvent = selectPolicyVersionForOccurredAt(versions, "2026-08-11T12:00:00+09:00")
  assert(checks, "C3-before-scheduled", beforeEvent?.version === 1, `got v${beforeEvent?.version}`)

  const afterEvent = selectPolicyVersionForOccurredAt(versions, "2026-08-12T01:00:00+09:00")
  assert(checks, "C3-after-scheduled", afterEvent?.version === 2, `got v${afterEvent?.version}`)

  const currentAtNow = getCurrentPolicyVersion(versions, "2026-08-11T23:59:00+09:00")
  assert(checks, "C4-current-before", currentAtNow?.version === 1, "current uses v1")

  const next = getNextScheduledPolicyVersion(versions, "2026-08-11T23:59:00+09:00")
  assert(checks, "C4-next-scheduled", next?.version === 2, "next is v2")

  const v3same = makeVersion({
    version: 3,
    effectiveFrom: "2026-08-12T00:00:00+09:00",
    policySnapshot: financeSnapshot(9, 1),
  })
  const tieBreak = selectPolicyVersionForOccurredAt(
    [v1, v2, v3same],
    "2026-08-13T00:00:00+09:00",
  )
  assert(checks, "C5-tiebreak-version", tieBreak?.version === 3, `version DESC → v${tieBreak?.version}`)

  const cancelled = makeVersion({
    version: 4,
    effectiveFrom: "2026-09-01T00:00:00+09:00",
    policySnapshot: financeSnapshot(8, 8),
    cancelledAt: "2026-08-10T09:00:00.000Z",
  })
  const withCancelled = selectPolicyVersionForOccurredAt(
    [v1, cancelled],
    "2026-09-02T00:00:00+09:00",
  )
  assert(checks, "C6-cancelled-skip", withCancelled?.version === 1, "cancelled skipped")

  const ext = validateExtensiblePolicySnapshotStructure(financeSnapshot(5, 10))
  assert(checks, "C7-extensible-schema", ext, "finance-only snapshot extensible")

  const bossOccurred = bossEventOccurredAtIso("2026-08-11", 14)
  assert(checks, "C8-boss-occurred-at", bossOccurred.includes("2026-08-11T14:00:00+09:00"), bossOccurred)

  const passed = checks.filter((c) => c.ok).length
  for (const c of checks) {
    console.log(`${c.ok ? "PASS" : "FAIL"} ${c.id}: ${c.detail}`)
  }
  console.log(`\nPhase 9c operation policy versions: ${passed}/${checks.length} passed`)
  if (passed !== checks.length) process.exit(1)
}

main()
