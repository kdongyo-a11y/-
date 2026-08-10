import {
  POLICY_AMOUNT_MODE_LABELS,
  RESERVE_MODE_LABELS,
  RATIO_BP_TOTAL,
  type OperationPolicyFinanceSnapshot,
  type OperationPolicySnapshotPayload,
  type PolicyAmountMode,
} from "@/lib/operation-settings-types"
import { formatKstDateShortLabel, formatKstDateTimeLabel } from "@/lib/operation-policy-kst-utils"

export type MemberPolicySectionPublic = {
  sectionKey: "finance" | string
  title: string
  lines: string[]
}

export type MemberPolicySnapshotPublic = {
  effectiveFrom: string
  effectiveFromLabel: string
  changeReason: string
  sections: MemberPolicySectionPublic[]
}

export type MemberOperationPolicyPublicView = {
  currentPolicy: MemberPolicySnapshotPublic | null
  nextScheduledPolicy: MemberPolicySnapshotPublic | null
  /** 현재 대비 다음 예약 변경 요약 (홈 카드용) */
  nextScheduledChangeLines: string[]
  scheduledPolicies: MemberPolicySnapshotPublic[]
  additionalScheduledCount: number
}

function formatMgmtShort(
  mode: PolicyAmountMode | undefined,
  pct: number | null | undefined,
): string {
  if (!mode || mode === "none") return "없음"
  if (mode === "percentage" && pct != null) return `${pct}%`
  return POLICY_AMOUNT_MODE_LABELS[mode]
}

function formatReserveShort(
  mode: PolicyAmountMode | undefined,
  pct: number | null | undefined,
): string {
  if (!mode || mode === "none") return "없음"
  if (mode === "percentage" && pct != null) return `${pct}%`
  return RESERVE_MODE_LABELS[mode]
}

function buildFinanceSectionPublic(
  finance: OperationPolicyFinanceSnapshot,
  memberNames: Map<string, string>,
): MemberPolicySectionPublic {
  const lines: string[] = [
    `관리비: ${formatMgmtShort(finance.managementFeeMode, finance.managementFeePercentage)}`,
    `혈맹 비축: ${formatReserveShort(finance.reserveMode, finance.reservePercentage)}`,
  ]

  if (finance.managementFeeMode !== "none" && finance.allocations.length > 0) {
    const allocLines = finance.allocations.map((a) => {
      const nickname = memberNames.get(a.memberId) ?? "혈원"
      const pct = Math.round((a.ratioBp / RATIO_BP_TOTAL) * 1000) / 10
      return `${nickname} ${pct}%`
    })
    lines.push(`관리비 수령: ${allocLines.join(", ")}`)
  }

  return {
    sectionKey: "finance",
    title: "재무 정책",
    lines,
  }
}

/** schemaVersion + section 기반 공개 렌더 — 미구현 section은 생략 */
export function buildMemberPolicySections(
  snapshot: OperationPolicySnapshotPayload,
  memberNames: Map<string, string>,
): MemberPolicySectionPublic[] {
  const sections: MemberPolicySectionPublic[] = []
  if (snapshot.finance) {
    sections.push(buildFinanceSectionPublic(snapshot.finance, memberNames))
  }
  return sections
}

export function toMemberPolicySnapshotPublic(
  input: {
    effectiveFrom: string
    changeReason: string
    policySnapshot: OperationPolicySnapshotPayload
  },
  memberNames: Map<string, string>,
): MemberPolicySnapshotPublic {
  return {
    effectiveFrom: input.effectiveFrom,
    effectiveFromLabel: formatKstDateTimeLabel(input.effectiveFrom),
    changeReason: input.changeReason,
    sections: buildMemberPolicySections(input.policySnapshot, memberNames),
  }
}

/** 홈 카드 요약 — 현재 대비 변경 줄 (finance section만) */
export function buildFinanceChangeSummaryLines(
  current: OperationPolicyFinanceSnapshot | null,
  next: OperationPolicyFinanceSnapshot,
): string[] {
  const lines: string[] = []
  const curMgmt = formatMgmtShort(current?.managementFeeMode, current?.managementFeePercentage)
  const nextMgmt = formatMgmtShort(next.managementFeeMode, next.managementFeePercentage)
  if (curMgmt !== nextMgmt) {
    lines.push(`관리비 ${curMgmt} → ${nextMgmt}`)
  }

  const curReserve = formatReserveShort(current?.reserveMode, current?.reservePercentage)
  const nextReserve = formatReserveShort(next.reserveMode, next.reservePercentage)
  if (curReserve !== nextReserve) {
    lines.push(`혈맹 비축 ${curReserve} → ${nextReserve}`)
  }

  return lines
}

export function formatScheduledEffectiveFromShort(iso: string): string {
  return `${formatKstDateShortLabel(iso)}부터`
}

/** 공개 view에 UUID/내부 필드가 없는지 검증 (테스트용) */
export function assertMemberPublicViewSanitized(view: MemberOperationPolicyPublicView): boolean {
  const json = JSON.stringify(view)
  const uuidPattern =
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i
  const forbiddenKeys = [
    "memberId",
    "createdBy",
    "auth_user_id",
    "policySnapshot",
    "created_by",
  ]
  if (uuidPattern.test(json)) return false
  return !forbiddenKeys.some((k) => json.includes(`"${k}"`))
}
