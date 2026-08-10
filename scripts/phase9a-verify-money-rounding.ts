/**
 * Phase 9a — 1,000원 절사 / 짜투리 혈맹 귀속 검증
 * 사용: npm run phase9a:verify-money-rounding
 */
import {
  applySubThousandCarryDelta,
  assertSettlementMoneyInvariant,
  floorToThousand,
  guildShareLedgerAndSub,
  reconcileCarryBalance,
  resolvePercentageReserveAmount,
  splitThousandRemainder,
  subThousandRemainder,
} from "../lib/money-utils"
import { calcSettlement, calcSettlementLegacy } from "../lib/settlement-utils"
import { runSettlementRevisionTests } from "../lib/settlement-revision-utils"

type Check = { id: string; ok: boolean; detail: string }

function assert(checks: Check[], id: string, ok: boolean, detail: string) {
  checks.push({ id, ok, detail })
}

function simulateGuildEconomy(
  settlementLedgerTotal: number,
  flushLedgerTotal: number,
  carry: number,
) {
  return settlementLedgerTotal + flushLedgerTotal + carry
}

function main() {
  const checks: Check[] = []

  assert(checks, "R1", floorToThousand(1_538_790) === 1_538_000, "1538790→1538000")

  const r2 = splitThousandRemainder(999)
  assert(
    checks,
    "R2",
    r2.roundedAmount === 0 && r2.remainder === 999,
    `999→0+999 got ${r2.roundedAmount}+${r2.remainder}`,
  )

  const r3 = splitThousandRemainder(1000)
  assert(
    checks,
    "R3",
    r3.roundedAmount === 1000 && r3.remainder === 0,
    `1000→1000+0 got ${r3.roundedAmount}+${r3.remainder}`,
  )

  const r4 = calcSettlement({
    totalRevenue: 10_007_500,
    guildShareInput: 0,
    participantCount: 7,
  })
  assert(
    checks,
    "R4-perPerson",
    r4.perPersonAmount === 1_429_000 && r4.perPersonAmount % 1000 === 0,
    `perPerson=${r4.perPersonAmount}`,
  )
  assert(
    checks,
    "R4-invariant",
    r4.totalDistributed + r4.guildShareFinal === r4.totalRevenue,
    `${r4.totalDistributed}+${r4.guildShareFinal}=${r4.totalRevenue}`,
  )
  assert(checks, "R4-remainder", r4.remainder === 4500, `remainder=${r4.remainder}`)

  assert(
    checks,
    "R5",
    r4.remainder > 0 && r4.guildShareFinal === r4.remainder,
    "distribution scrap→guild",
  )

  const r6 = resolvePercentageReserveAmount(10_000_000, 10)
  assert(
    checks,
    "R6",
    r6.rawAmount === 1_000_000 &&
      r6.reserveAmount === 1_000_000 &&
      r6.reserveRemainder === 0,
    `10% of 10M → ${r6.reserveAmount}+${r6.reserveRemainder}`,
  )

  const r7 = resolvePercentageReserveAmount(10_007_500, 10)
  assert(
    checks,
    "R7-future",
    r7.reserveAmount % 1000 === 0 && r7.rawAmount === r7.reserveAmount + r7.reserveRemainder,
    `future helper raw=${r7.rawAmount} reserve=${r7.reserveAmount} rem=${r7.reserveRemainder}`,
  )

  const r8 = applySubThousandCarryDelta(725, 0, 0, subThousandRemainder(1400))
  assert(
    checks,
    "R8",
    r8.flushDelta === 1000 && r8.carry === 125,
    `carry 725+sub400 → flush ${r8.flushDelta}, carry ${r8.carry}`,
  )

  let carryA = 0
  let flushA = 0
  let ledgerA = 0
  const s1 = applySubThousandCarryDelta(carryA, flushA, 0, subThousandRemainder(500))
  carryA = s1.carry
  flushA = s1.flushLedgerTotal
  ledgerA += guildShareLedgerAndSub(500).ledgerAmount

  const s2 = applySubThousandCarryDelta(carryA, flushA, 0, subThousandRemainder(600))
  carryA = s2.carry
  flushA = s2.flushLedgerTotal
  ledgerA += guildShareLedgerAndSub(600).ledgerAmount

  const s1Rev = applySubThousandCarryDelta(
    carryA,
    flushA,
    subThousandRemainder(500),
    subThousandRemainder(800),
  )
  ledgerA = ledgerA - guildShareLedgerAndSub(500).ledgerAmount + guildShareLedgerAndSub(800).ledgerAmount
  assert(
    checks,
    "R9",
    s1Rev.carry === 400 && s1Rev.flushDelta === 0,
    `revision carry=${s1Rev.carry} (expected 400)`,
  )

  const guildA = applySubThousandCarryDelta(100, 0, 0, subThousandRemainder(550))
  const guildB = applySubThousandCarryDelta(200, 0, 0, subThousandRemainder(550))
  assert(
    checks,
    "R10",
    guildA.carry === 650 && guildB.carry === 750 && guildA.carry !== guildB.carry,
    `guildA=${guildA.carry} guildB=${guildB.carry}`,
  )

  const legacy = calcSettlementLegacy({
    totalRevenue: 3_500_000,
    guildShareInput: 500_000,
    participantCount: 3,
  })
  const modern = calcSettlement({
    totalRevenue: 3_500_000,
    guildShareInput: 500_000,
    participantCount: 3,
  })
  assert(
    checks,
    "R11-legacy",
    legacy.perPersonAmount === 1_000_000 && legacy.roundingUnit === 1,
    "legacy calc unchanged",
  )
  assert(
    checks,
    "R11-modern",
    modern.roundingUnit === 1000 && modern.perPersonAmount === 1_000_000,
    "modern same for exact-thousand case",
  )

  const rev = runSettlementRevisionTests()
  assert(checks, "R9-revision-suite", rev.ok, rev.results.filter((r) => r.startsWith("FAIL")).join("; ") || "all pass")

  assert(
    checks,
    "R13",
    r4.totalRevenue === 10_007_500,
    `total_income preserved ${r4.totalRevenue}`,
  )

  assert(
    checks,
    "R14",
    r4.perPersonAmount % 1000 === 0 &&
      r4.totalDistributed + r4.guildShareFinal === r4.totalRevenue,
    "all scrap→guild, payouts 1000-unit",
  )

  const prevFinal = 12_345
  const nextFinal = 13_567
  const prevParts = guildShareLedgerAndSub(prevFinal)
  const nextParts = guildShareLedgerAndSub(nextFinal)
  const ledgerDelta = nextParts.ledgerAmount - prevParts.ledgerAmount
  const carryDelta = nextParts.subThousand - prevParts.subThousand
  const r15Carry = applySubThousandCarryDelta(100, 5000, prevParts.subThousand, nextParts.subThousand)
  assert(
    checks,
    "R15-ledger-delta",
    ledgerDelta === 1000,
    `ledger delta=${ledgerDelta}`,
  )
  assert(checks, "R15-carry-delta", carryDelta === 222, `carry delta=${carryDelta}`)
  assert(
    checks,
    "R15-total-economic",
    ledgerDelta + carryDelta === nextFinal - prevFinal,
    `economic +${ledgerDelta + carryDelta}`,
  )
  assert(
    checks,
    "R15-no-double",
    r15Carry.carry === 100 - prevParts.subThousand + nextParts.subThousand,
    `carry=${r15Carry.carry}`,
  )

  let carry16 = 900
  let flush16 = 5000
  let ledger16 = 0
  const before16 = simulateGuildEconomy(ledger16, flush16, carry16)
  const add16 = applySubThousandCarryDelta(carry16, flush16, 0, 200)
  carry16 = add16.carry
  flush16 = add16.flushLedgerTotal
  const afterAdd16 = simulateGuildEconomy(ledger16, flush16, carry16)

  const rev16 = applySubThousandCarryDelta(carry16, flush16, 200, 0)
  carry16 = rev16.carry
  flush16 = rev16.flushLedgerTotal
  const afterRev16 = simulateGuildEconomy(ledger16, flush16, carry16)

  assert(
    checks,
    "R16-reversal",
    rev16.reverseDelta === 1000 && carry16 === 900 && flush16 === 5000,
    `reverse ${rev16.reverseDelta}, carry ${carry16}, flush ${flush16}`,
  )
  assert(
    checks,
    "R16-conservation",
    afterAdd16 - before16 === 200 && afterRev16 === before16,
    `economic +200 then net 0`,
  )
  assert(checks, "R16-carry-range", carry16 >= 0 && carry16 < 1000, `carry=${carry16}`)

  let carry17 = 0
  let flush17 = 0
  let ledger17 = 0
  const finals17 = [500, 600, 800, 1350, 900]
  for (const final of finals17) {
    const sub = subThousandRemainder(final)
    const ledgerPart = guildShareLedgerAndSub(final).ledgerAmount
    const r = applySubThousandCarryDelta(carry17, flush17, 0, sub)
    carry17 = r.carry
    flush17 = r.flushLedgerTotal
    ledger17 += ledgerPart
  }
  const economic17 = ledger17 + flush17 + carry17
  const expected17 = finals17.reduce((s, v) => s + v, 0)
  assert(
    checks,
    "R17",
    economic17 === expected17,
    `economic ${economic17} === sum finals ${expected17}`,
  )

  let carry18 = 300
  let flush18 = 2000
  const once = applySubThousandCarryDelta(carry18, flush18, 150, 150)
  const twice = applySubThousandCarryDelta(once.carry, once.flushLedgerTotal, 150, 150)
  assert(
    checks,
    "R18",
    twice.carry === once.carry &&
      twice.flushLedgerTotal === once.flushLedgerTotal &&
      twice.flushDelta === 0 &&
      twice.reverseDelta === 0,
    "idempotent when prevSub=nextSub",
  )

  assert(
    checks,
    "R-invariant-helper",
    assertSettlementMoneyInvariant({
      totalIncomeOriginal: r4.totalRevenue,
      participantPayments: r4.totalDistributed,
      settlementGuildLedgerAmount: r4.guildShareLedgerAmount,
      cumulativeRoundingFlush: 0,
      currentRoundingCarry: r4.guildShareSubThousand,
    }),
    "helper invariant with sub-thousand in carry slot",
  )

  const flushed = reconcileCarryBalance(2125, 0)
  assert(
    checks,
    "R-flush-math",
    flushed.flushDelta === 2000 && flushed.carry === 125,
    "2125→flush2000 carry125",
  )

  let failed = 0
  for (const c of checks) {
    const mark = c.ok ? "PASS" : "FAIL"
    if (!c.ok) failed++
    console.log(`${mark} ${c.id}: ${c.detail}`)
  }

  console.log("")
  console.log(`Phase 9a money rounding: ${checks.length - failed}/${checks.length} passed`)

  if (failed > 0) process.exit(1)
}

main()
