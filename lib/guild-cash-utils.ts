import type { GuildCashCheckpoint, GuildCashMovement } from "@/lib/guild-cash-types"

/** effective_at <= asOf 시점 기준 가장 최근 checkpoint */
export function selectLatestCheckpoint(
  checkpoints: GuildCashCheckpoint[],
  asOf: Date = new Date(),
): GuildCashCheckpoint | null {
  const asOfMs = asOf.getTime()
  let latest: GuildCashCheckpoint | null = null
  for (const cp of checkpoints) {
    const ms = new Date(cp.effectiveAt).getTime()
    if (ms > asOfMs) continue
    if (!latest || ms > new Date(latest.effectiveAt).getTime()) {
      latest = cp
    }
  }
  return latest
}

/** checkpoint.effective_at 이후 movement만 합산 (재기준 시 이전 movement 제외) */
export function computeCashBalance(
  checkpoint: GuildCashCheckpoint | null,
  movements: GuildCashMovement[],
): number {
  if (!checkpoint) return 0
  const cutoffMs = new Date(checkpoint.effectiveAt).getTime()
  let balance = checkpoint.openingCashBalance
  for (const m of movements) {
    if (m.cancelled) continue
    if (new Date(m.movementAt).getTime() < cutoffMs) continue
    if (m.direction === "in") balance += m.amount
    else balance -= m.amount
  }
  return balance
}

/** go-forward cutoff: checkpoint 없으면 false (historical 제외) */
export function isOnOrAfterCheckpointCutoff(
  occurredAtIso: string,
  checkpoint: GuildCashCheckpoint | null,
): boolean {
  if (!checkpoint) return false
  return new Date(occurredAtIso).getTime() >= new Date(checkpoint.effectiveAt).getTime()
}
