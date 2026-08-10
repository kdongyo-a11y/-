import type {
  GuildOperationSettings,
  OperationPolicySnapshotPayload,
  PolicyAmountMode,
} from "@/lib/operation-settings-types"
import { OPERATION_POLICY_SCHEMA_VERSION } from "@/lib/operation-settings-types"

export type GuildOperationPolicyVersion = {
  id: string
  guildId: string
  version: number
  effectiveFrom: string
  createdAt: string
  createdBy: string | null
  changeReason: string
  policySnapshot: OperationPolicySnapshotPayload
  cancelledAt: string | null
  cancelledBy: string | null
  cancelReason: string | null
}

export type PolicyVersionFinanceInput = {
  managementFeeMode: PolicyAmountMode
  managementFeePercentage: number | null
  reserveMode: PolicyAmountMode
  reservePercentage: number | null
  allocations: Array<{ memberId: string; ratioBp: number }>
}

export function buildPolicySnapshotV1(finance: PolicyVersionFinanceInput): OperationPolicySnapshotPayload {
  return {
    schemaVersion: OPERATION_POLICY_SCHEMA_VERSION,
    finance: {
      managementFeeMode: finance.managementFeeMode,
      managementFeePercentage:
        finance.managementFeeMode === "percentage" ? finance.managementFeePercentage : null,
      reserveMode: finance.reserveMode,
      reservePercentage: finance.reserveMode === "percentage" ? finance.reservePercentage : null,
      allocations: finance.allocations.map((a) => ({
        memberId: a.memberId,
        ratioBp: a.ratioBp,
      })),
    },
  }
}

export function parsePolicySnapshotPayload(value: unknown): OperationPolicySnapshotPayload | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (row.schemaVersion !== OPERATION_POLICY_SCHEMA_VERSION) return null
  if (!row.finance || typeof row.finance !== "object") return null
  const finance = row.finance as Record<string, unknown>
  return {
    schemaVersion: OPERATION_POLICY_SCHEMA_VERSION,
    finance: {
      managementFeeMode: finance.managementFeeMode as PolicyAmountMode,
      managementFeePercentage:
        finance.managementFeePercentage != null ? Number(finance.managementFeePercentage) : null,
      reserveMode: finance.reserveMode as PolicyAmountMode,
      reservePercentage:
        finance.reservePercentage != null ? Number(finance.reservePercentage) : null,
      allocations: Array.isArray(finance.allocations)
        ? finance.allocations.map((a) => {
            const item = a as Record<string, unknown>
            return {
              memberId: String(item.memberId),
              ratioBp: Number(item.ratioBp),
            }
          })
        : [],
    },
  }
}

export function financeSettingsFromSnapshot(
  snapshot: OperationPolicySnapshotPayload,
  memberNames: Map<string, string>,
): GuildOperationSettings {
  const f = snapshot.finance
  return {
    managementFeeMode: f.managementFeeMode,
    managementFeePercentage: f.managementFeePercentage,
    reserveMode: f.reserveMode,
    reservePercentage: f.reservePercentage,
    allocations: f.allocations.map((a) => ({
      memberId: a.memberId,
      nickname: memberNames.get(a.memberId) ?? "혈원",
      ratioBp: a.ratioBp,
    })),
    updatedAt: null,
  }
}

/** effective_from <= occurredAt, cancelled 제외, effective_from DESC / version DESC */
export function selectPolicyVersionForOccurredAt(
  versions: GuildOperationPolicyVersion[],
  occurredAtIso: string,
): GuildOperationPolicyVersion | null {
  const occurredMs = new Date(occurredAtIso).getTime()
  const eligible = versions.filter((v) => {
    if (v.cancelledAt) return false
    return new Date(v.effectiveFrom).getTime() <= occurredMs
  })

  eligible.sort((a, b) => {
    const efDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    if (efDiff !== 0) return efDiff
    return b.version - a.version
  })

  return eligible[0] ?? null
}

export function getCurrentPolicyVersion(
  versions: GuildOperationPolicyVersion[],
  nowIso = new Date().toISOString(),
): GuildOperationPolicyVersion | null {
  return selectPolicyVersionForOccurredAt(versions, nowIso)
}

/** 가장 가까운 미래 예약 정책 (cancelled 제외) */
export function getNextScheduledPolicyVersion(
  versions: GuildOperationPolicyVersion[],
  nowIso = new Date().toISOString(),
): GuildOperationPolicyVersion | null {
  const nowMs = new Date(nowIso).getTime()
  const future = versions
    .filter((v) => !v.cancelledAt && new Date(v.effectiveFrom).getTime() > nowMs)
    .sort(
      (a, b) =>
        new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime() ||
        a.version - b.version,
    )
  return future[0] ?? null
}

export function isScheduledPolicyVersion(
  version: GuildOperationPolicyVersion,
  nowIso = new Date().toISOString(),
): boolean {
  return !version.cancelledAt && new Date(version.effectiveFrom).getTime() > new Date(nowIso).getTime()
}

export function canCancelPolicyVersion(
  version: GuildOperationPolicyVersion,
  nowIso = new Date().toISOString(),
): boolean {
  return isScheduledPolicyVersion(version, nowIso)
}

/** 향후 contribution/level 등 동일 version 체계 확장 가능 여부 */
export function validateExtensiblePolicySnapshotStructure(snapshot: OperationPolicySnapshotPayload): boolean {
  return (
    snapshot.schemaVersion === OPERATION_POLICY_SCHEMA_VERSION &&
    typeof snapshot.finance === "object" &&
    snapshot.finance != null
  )
}
