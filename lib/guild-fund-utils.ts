/**
 * 혈맹 공용자금 ledger 해석 — 공용자금과 개인 분배 ledger 분리.
 *
 * 신규: `{settlementKey}-guild` income = guildShareFinal
 * 레거시: `{key}-rev` income + `{key}-dist` expense → net guildShare
 * 무시: `-add-`, `-return-` (개인 정산 전용, 공용자금 미반영)
 */

export const GUILD_SHARE_LEDGER_SUFFIX = "-guild"
export const LEGACY_REV_LEDGER_SUFFIX = "-rev"
export const LEGACY_DIST_LEDGER_SUFFIX = "-dist"

export type GuildFundLedgerEntry = {
  date: string
  type: "수입" | "지출"
  amount: number
  sourceType: "settlement" | "dues" | "expense" | "manual" | "legacy"
  sourceId: string
  cancelled: boolean
}

function isLegacyPersonalSettlementLedger(sourceId: string): boolean {
  return sourceId.includes("-add-") || sourceId.includes("-return-")
}

function settlementBaseKey(sourceId: string): string | null {
  if (sourceId.endsWith(GUILD_SHARE_LEDGER_SUFFIX)) {
    return sourceId.slice(0, -GUILD_SHARE_LEDGER_SUFFIX.length)
  }
  if (sourceId.endsWith(LEGACY_REV_LEDGER_SUFFIX)) {
    return sourceId.slice(0, -LEGACY_REV_LEDGER_SUFFIX.length)
  }
  if (sourceId.endsWith(LEGACY_DIST_LEDGER_SUFFIX)) {
    return sourceId.slice(0, -LEGACY_DIST_LEDGER_SUFFIX.length)
  }
  return null
}

function collectSettlementKeys(entries: GuildFundLedgerEntry[]): Set<string> {
  const keys = new Set<string>()
  for (const e of entries) {
    if (e.sourceType !== "settlement" || e.cancelled) continue
    if (isLegacyPersonalSettlementLedger(e.sourceId)) continue
    const base = settlementBaseKey(e.sourceId)
    if (base) keys.add(base)
  }
  return keys
}

/** 정산 1건당 혈맹 귀속 공용 수입 (신규 -guild 우선, 없으면 레거시 rev−dist) */
export function settlementGuildShareFromEntries(
  entries: GuildFundLedgerEntry[],
  settlementKey: string,
): number {
  const active = entries.filter((e) => !e.cancelled)

  const guild = active.find(
    (e) =>
      e.sourceType === "settlement" &&
      e.sourceId === `${settlementKey}${GUILD_SHARE_LEDGER_SUFFIX}` &&
      e.type === "수입",
  )
  if (guild) return guild.amount

  const rev = active.find(
    (e) =>
      e.sourceType === "settlement" &&
      e.sourceId === `${settlementKey}${LEGACY_REV_LEDGER_SUFFIX}` &&
      e.type === "수입",
  )
  const dist = active.find(
    (e) =>
      e.sourceType === "settlement" &&
      e.sourceId === `${settlementKey}${LEGACY_DIST_LEDGER_SUFFIX}` &&
      e.type === "지출",
  )
  if (rev && dist) return rev.amount - dist.amount
  if (rev) return rev.amount
  return 0
}

export function sumSettlementGuildShareIncome(entries: GuildFundLedgerEntry[]): number {
  const keys = collectSettlementKeys(entries)
  let total = 0
  for (const key of keys) {
    total += settlementGuildShareFromEntries(entries, key)
  }
  return total
}

export function sumDuesIncome(entries: GuildFundLedgerEntry[]): number {
  return entries
    .filter((e) => !e.cancelled && e.sourceType === "dues" && e.type === "수입")
    .reduce((s, e) => s + e.amount, 0)
}

export function sumActiveExpenses(entries: GuildFundLedgerEntry[]): number {
  return entries
    .filter((e) => !e.cancelled && e.sourceType === "expense" && e.type === "지출")
    .reduce((s, e) => s + e.amount, 0)
}

function sumManualAdjustments(entries: GuildFundLedgerEntry[]): number {
  let delta = 0
  for (const e of entries) {
    if (e.cancelled) continue
    if (e.sourceType !== "manual" && e.sourceType !== "legacy") continue
    if (e.type === "수입") delta += e.amount
    else delta -= e.amount
  }
  return delta
}

/** 현재 혈맹자금 = opening + 귀속 + 혈비납부 − 공용지출 (+ manual/legacy) */
export function computeGuildFundFromLedger(
  openingBalance: number,
  entries: GuildFundLedgerEntry[],
): number {
  return (
    openingBalance +
    sumSettlementGuildShareIncome(entries) +
    sumDuesIncome(entries) -
    sumActiveExpenses(entries) +
    sumManualAdjustments(entries)
  )
}

/** 누적 혈비 = 보스/공성 귀속 + 실제 혈비 납부 (기초자금·지출 제외) */
export function computeCumulativeGuildContributions(entries: GuildFundLedgerEntry[]): number {
  return sumSettlementGuildShareIncome(entries) + sumDuesIncome(entries)
}

export function computeMonthGuildIncome(
  entries: GuildFundLedgerEntry[],
  yearMonth: string,
): number {
  const inMonth = entries.filter((e) => !e.cancelled && e.date.startsWith(yearMonth))
  const keys = collectSettlementKeys(inMonth)
  let settlementIncome = 0
  for (const key of keys) {
    const guild = inMonth.find(
      (e) =>
        e.sourceType === "settlement" &&
        e.sourceId === `${key}${GUILD_SHARE_LEDGER_SUFFIX}` &&
        e.type === "수입",
    )
    if (guild) {
      settlementIncome += guild.amount
      continue
    }
    const rev = inMonth.find(
      (e) =>
        e.sourceType === "settlement" &&
        e.sourceId === `${key}${LEGACY_REV_LEDGER_SUFFIX}` &&
        e.type === "수입",
    )
    const dist = inMonth.find(
      (e) =>
        e.sourceType === "settlement" &&
        e.sourceId === `${key}${LEGACY_DIST_LEDGER_SUFFIX}` &&
        e.type === "지출",
    )
    if (rev && dist) settlementIncome += rev.amount - dist.amount
    else if (rev) settlementIncome += rev.amount
  }
  const duesIncome = inMonth
    .filter((e) => e.sourceType === "dues" && e.type === "수입")
    .reduce((s, e) => s + e.amount, 0)
  return settlementIncome + duesIncome
}

export function computeMonthGuildExpense(
  entries: GuildFundLedgerEntry[],
  yearMonth: string,
): number {
  return entries
    .filter(
      (e) =>
        !e.cancelled &&
        e.sourceType === "expense" &&
        e.type === "지출" &&
        e.date.startsWith(yearMonth),
    )
    .reduce((s, e) => s + e.amount, 0)
}

/** 정합성 테스트 (시나리오 13·14) */
export function runGuildFundUtilsTests(): { ok: boolean; results: string[] } {
  const results: string[] = []
  let ok = true
  function assert(label: string, cond: boolean) {
    if (!cond) {
      ok = false
      results.push(`FAIL: ${label}`)
    } else {
      results.push(`PASS: ${label}`)
    }
  }

  const opening = 30_000_000
  const entries: GuildFundLedgerEntry[] = [
    {
      date: "2026-08-01",
      type: "수입",
      amount: 1_000_000,
      sourceType: "settlement",
      sourceId: "boss:2026-08-01-20-guild",
      cancelled: false,
    },
    {
      date: "2026-08-02",
      type: "수입",
      amount: 2_000_000,
      sourceType: "settlement",
      sourceId: "siege:siege-2026-08-02-guild",
      cancelled: false,
    },
    {
      date: "2026-08-03",
      type: "수입",
      amount: 500_000,
      sourceType: "dues",
      sourceId: "bill:member1",
      cancelled: false,
    },
    {
      date: "2026-08-04",
      type: "지출",
      amount: 3_000_000,
      sourceType: "expense",
      sourceId: "exp-1",
      cancelled: false,
    },
  ]

  assert("scenario 13 fund", computeGuildFundFromLedger(opening, entries) === 30_500_000)
  assert(
    "scenario 13 month income",
    computeMonthGuildIncome(entries, "2026-08") === 3_500_000,
  )
  assert(
    "scenario 13 month expense",
    computeMonthGuildExpense(entries, "2026-08") === 3_000_000,
  )
  assert(
    "cumulative contributions",
    computeCumulativeGuildContributions(entries) === 3_500_000,
  )

  const legacyEntries: GuildFundLedgerEntry[] = [
    {
      date: "2026-08-01",
      type: "수입",
      amount: 10_000_000,
      sourceType: "settlement",
      sourceId: "boss:slot-rev",
      cancelled: false,
    },
    {
      date: "2026-08-01",
      type: "지출",
      amount: 9_000_000,
      sourceType: "settlement",
      sourceId: "boss:slot-dist",
      cancelled: false,
    },
  ]
  assert(
    "legacy rev-dist net",
    settlementGuildShareFromEntries(legacyEntries, "boss:slot") === 1_000_000,
  )

  const revised: GuildFundLedgerEntry[] = [
    {
      date: "2026-08-05",
      type: "수입",
      amount: 800_000,
      sourceType: "settlement",
      sourceId: "boss:slot-guild",
      cancelled: false,
    },
    ...legacyEntries,
  ]
  assert(
    "scenario 14 new guild overrides legacy",
    settlementGuildShareFromEntries(revised, "boss:slot") === 800_000,
  )
  assert(
    "scenario 14 fund uses 800k not 1.8M",
    computeGuildFundFromLedger(0, revised) === 800_000,
  )

  return { ok, results }
}
