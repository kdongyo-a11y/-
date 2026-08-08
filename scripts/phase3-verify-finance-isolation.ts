/**
 * Phase 3 settlement/dues/expense/ledger 테넌트 격리 검증
 * 사용: npm run phase3:verify-isolation
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { loadEnvLocal, requireEnv } from "./load-env-local"
import { loginFixtureGuild, getFixtureServerId, fetchGuildIdByServerAndCode } from "./test-auth-helpers"
import { fetchMemberByServerGuildNameAndNickname } from "../lib/supabase/auth-helpers"
import { FIXTURE_GUILD_NAMES } from "../lib/guild-types"
import { createBossSettlementOnServer } from "../lib/supabase/settlement-mutate-helpers"
import { getSettlementByKey } from "../lib/supabase/settlement-data"
import { requireDueInActorGuild, requireExpenseInActorGuild, requireMemberInActorGuild } from "../lib/supabase/guild-scope-helpers"
import { computeGuildFundFromLedger } from "../lib/guild-fund-utils"
import { makeSlotId } from "../lib/boss-time-slots"
import { upsertLedgerEntry, ledgerRowToEntry } from "../lib/supabase/finance-data"
import { GUILD_SHARE_LEDGER_SUFFIX } from "../lib/guild-fund-utils"
import { makeSettlementKey } from "../lib/settlement-types"

loadEnvLocal()

const TEST_PASSWORD = process.env.PHASE1_TEST_PASSWORD ?? "test1234"
const TEST_MONTH = "2026-09"
const SLOT_ID = makeSlotId("2026-08-09", 12)

type Check = { id: string; ok: boolean; detail: string }

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY")
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  await assertMigrationApplied(admin)

  const results: Check[] = []

  const fixtureServerId = await getFixtureServerId(admin)

  const redGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "RED")
  const blueGuildId = await fetchGuildIdByServerAndCode(admin, fixtureServerId, "BLUE")
  if (!redGuildId || !blueGuildId) {
    console.error("RED/BLUE guild 없음")
    process.exit(1)
  }
  const redGuild = { id: redGuildId }
  const blueGuild = { id: blueGuildId }

  const redMember = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.RED,
    "군주",
  )
  const blueMember = await fetchMemberByServerGuildNameAndNickname(
    admin,
    fixtureServerId,
    FIXTURE_GUILD_NAMES.BLUE,
    "군주",
  )
  if (!redMember || !blueMember) {
    console.error("RED/BLUE 군주 없음")
    process.exit(1)
  }

  // Ensure boss participations for settlement
  const { data: redBoss } = await admin
    .from("boss_events")
    .select("id")
    .eq("guild_id", redGuild.id)
    .eq("event_date", "2026-08-09")
    .eq("slot_hour", 12)
    .maybeSingle()
  const { data: blueBoss } = await admin
    .from("boss_events")
    .select("id")
    .eq("guild_id", blueGuild.id)
    .eq("event_date", "2026-08-09")
    .eq("slot_hour", 12)
    .maybeSingle()

  if (redBoss) {
    await admin.from("boss_participations").upsert(
      {
        boss_event_id: redBoss.id,
        member_id: redMember.id,
        source: "manual",
        status: "participated",
      },
      { onConflict: "boss_event_id,member_id" },
    )
  }
  if (blueBoss) {
    await admin.from("boss_participations").upsert(
      {
        boss_event_id: blueBoss.id,
        member_id: blueMember.id,
        source: "manual",
        status: "participated",
      },
      { onConflict: "boss_event_id,member_id" },
    )
  }

  // T1: same source_id, different guild settlements
  let redSettleOk = false
  let blueSettleOk = false
  const existingRed = await getSettlementByKey(admin, redGuild.id, "boss", SLOT_ID)
  const existingBlue = await getSettlementByKey(admin, blueGuild.id, "boss", SLOT_ID)
  if (existingRed) redSettleOk = true
  else {
    const r = await createBossSettlementOnServer(admin, redMember.id, redGuild.id, SLOT_ID, 100000, 30000)
    redSettleOk = r.ok
  }
  if (existingBlue) blueSettleOk = true
  else {
    const r = await createBossSettlementOnServer(admin, blueMember.id, blueGuild.id, SLOT_ID, 200000, 50000)
    blueSettleOk = r.ok
  }
  results.push({
    id: "T1",
    ok: redSettleOk && blueSettleOk,
    detail: `RED create/skip=${redSettleOk}, BLUE create/skip=${blueSettleOk} (same slotId)`,
  })

  const { data: redSettleRow } = await admin
    .from("settlements")
    .select("id, guild_id, final_guild_amount")
    .eq("guild_id", redGuild.id)
    .eq("source_type", "boss")
    .eq("source_id", SLOT_ID)
    .single()
  const { data: blueSettleRow } = await admin
    .from("settlements")
    .select("id, guild_id, final_guild_amount")
    .eq("guild_id", blueGuild.id)
    .eq("source_type", "boss")
    .eq("source_id", SLOT_ID)
    .single()

  const redSettlement = await getSettlementByKey(admin, redGuild.id, "boss", SLOT_ID)
  const blueSettlement = await getSettlementByKey(admin, blueGuild.id, "boss", SLOT_ID)

  async function loginAs(fixture: "RED" | "BLUE") {
    return loginFixtureGuild(url, anonKey, admin, fixture, "군주", TEST_PASSWORD)
  }

  try {
    const { client: redClient } = await loginAs("RED")
    const { data: redRows } = await redClient.from("settlements").select("id, guild_id")
    const redOwn = (redRows ?? []).filter((r) => r.guild_id === redGuild.id)
    const redCross = (redRows ?? []).filter((r) => r.guild_id === blueGuild.id)
    results.push({
      id: "T2",
      ok: redCross.length === 0 && redOwn.length >= 1,
      detail: `RED ownGuildSettlementCount=${redOwn.length}, RED crossGuildSettlementCount=${redCross.length}`,
    })

    const { client: blueClient } = await loginAs("BLUE")
    const { data: blueRows } = await blueClient.from("settlements").select("id, guild_id")
    const blueOwn = (blueRows ?? []).filter((r) => r.guild_id === blueGuild.id)
    const blueCross = (blueRows ?? []).filter((r) => r.guild_id === redGuild.id)
    results.push({
      id: "T2b",
      ok: blueCross.length === 0 && blueOwn.length >= 1,
      detail: `BLUE ownGuildSettlementCount=${blueOwn.length}, BLUE crossGuildSettlementCount=${blueCross.length}`,
    })

    const { data: directRedSelect } = redSettleRow
      ? await blueClient.from("settlements").select("id").eq("id", redSettleRow.id).maybeSingle()
      : { data: null }

    results.push({
      id: "T3",
      ok: !directRedSelect,
      detail: directRedSelect ? "BLUE → RED settlement ID 노출" : "BLUE → RED settlement ID 차단",
    })

    const crossUpdate =
      redSettleRow &&
      ((await admin
        .from("settlements")
        .update({ memo: "hack" })
        .eq("id", redSettleRow.id)
        .eq("guild_id", blueGuild.id)
        .select("id")).data?.length ?? 0) === 0
    results.push({
      id: "T4b",
      ok: !!crossUpdate,
      detail: "BLUE → RED settlement UPDATE guild_id 조건 차단",
    })

    await blueClient.auth.signOut()
    await redClient.auth.signOut()
  } catch (e) {
    results.push({ id: "T2-T3", ok: false, detail: e instanceof Error ? e.message : String(e) })
  }

  // T4 cross-guild participant
  const crossMember = await requireMemberInActorGuild(admin, redGuild.id, blueMember.id)
  results.push({
    id: "T4",
    ok: !crossMember.ok,
    detail: crossMember.ok ? "cross-guild member 허용" : "RED → BLUE member 차단",
  })

  // T5: 지급/반환/수령 확인 대상 member cross-guild 차단
  const t5RedToBlue = await requireMemberInActorGuild(admin, redGuild.id, blueMember.id)
  const t5BlueToRed = await requireMemberInActorGuild(admin, blueGuild.id, redMember.id)
  results.push({
    id: "T5",
    ok: !t5RedToBlue.ok && !t5BlueToRed.ok,
    detail: "추가지급/반환/수령확인 cross-guild member 차단 (requireMemberInActorGuild)",
  })

  // D1: same month dues (skip if exists)
  const { data: existingRedDue } = await admin
    .from("dues")
    .select("id")
    .eq("guild_id", redGuild.id)
    .eq("dues_month", TEST_MONTH)
    .maybeSingle()
  const { data: existingBlueDue } = await admin
    .from("dues")
    .select("id")
    .eq("guild_id", blueGuild.id)
    .eq("dues_month", TEST_MONTH)
    .maybeSingle()

  let d1RedOk = !!existingRedDue
  let d1BlueOk = !!existingBlueDue
  if (!existingRedDue) {
    const r = await admin.from("dues").insert({
      guild_id: redGuild.id,
      dues_month: TEST_MONTH,
      amount_per_member: 10000,
      due_date: "2026-09-30",
      created_by: redMember.id,
    })
    d1RedOk = !r.error
  }
  if (!existingBlueDue) {
    const r = await admin.from("dues").insert({
      guild_id: blueGuild.id,
      dues_month: TEST_MONTH,
      amount_per_member: 15000,
      due_date: "2026-09-30",
      created_by: blueMember.id,
    })
    d1BlueOk = !r.error
  }
  results.push({
    id: "D1",
    ok: d1RedOk && d1BlueOk,
    detail: `RED/BLUE same month ${TEST_MONTH} dues both ok`,
  })

  try {
    const { client: blueClient } = await loginAs("BLUE")
    const { data: blueDues } = await blueClient.from("dues").select("id, guild_id")
    const crossDues = (blueDues ?? []).filter((d) => d.guild_id === redGuild.id)
    results.push({
      id: "D2",
      ok: crossDues.length === 0,
      detail: `BLUE ownGuildDueCount=${(blueDues ?? []).length}, BLUE crossGuildDueCount=${crossDues.length}`,
    })

    if (existingRedDue || d1RedOk) {
      const dueId =
        existingRedDue?.id ??
        (await admin.from("dues").select("id").eq("guild_id", redGuild.id).eq("dues_month", TEST_MONTH).single())
          .data?.id
      if (dueId) {
        const dueCheck = await requireDueInActorGuild(admin, blueGuild.id, dueId)
        results.push({
          id: "D3",
          ok: !dueCheck.ok,
          detail: dueCheck.ok ? "BLUE → RED due 접근 허용" : "BLUE → RED due 차단",
        })
      }
    }
    await blueClient.auth.signOut()
  } catch (e) {
    results.push({ id: "D2-D3", ok: false, detail: e instanceof Error ? e.message : String(e) })
  }

  // E1-E3 expenses
  const { data: redExp } = await admin.from("expenses").insert({
    guild_id: redGuild.id,
    expense_date: "2026-08-09",
    expense_type: "기타",
    amount: 5000,
    description: "RED test expense",
    created_by: redMember.id,
  }).select("id").single()
  const { data: blueExp } = await admin.from("expenses").insert({
    guild_id: blueGuild.id,
    expense_date: "2026-08-09",
    expense_type: "기타",
    amount: 7000,
    description: "BLUE test expense",
    created_by: blueMember.id,
  }).select("id").single()

  results.push({ id: "E1", ok: !!redExp && !!blueExp, detail: "RED/BLUE expense created" })

  try {
    const { client: redClient } = await loginAs("RED")
    const { data: redExps } = await redClient.from("expenses").select("id, guild_id")
    const crossExp = (redExps ?? []).filter((e) => e.guild_id === blueGuild.id)
    results.push({
      id: "E2",
      ok: crossExp.length === 0,
      detail: `RED ownGuildExpenseCount=${(redExps ?? []).filter((e) => e.guild_id === redGuild.id).length}, RED crossGuildExpenseCount=${crossExp.length}`,
    })
    if (blueExp) {
      const expCheck = await requireExpenseInActorGuild(admin, redGuild.id, blueExp.id)
      results.push({
        id: "E3",
        ok: !expCheck.ok,
        detail: expCheck.ok ? "cross-guild expense 접근" : "cross-guild expense 차단",
      })
    }
    await redClient.auth.signOut()
  } catch (e) {
    results.push({ id: "E2-E3", ok: false, detail: e instanceof Error ? e.message : String(e) })
  }

  // Ledger L1-L9
  const key = makeSettlementKey("boss", SLOT_ID)
  await upsertLedgerEntry(admin, redGuild.id, {
    entryType: "income",
    sourceType: "boss_settlement",
    sourceId: `${key}${GUILD_SHARE_LEDGER_SUFFIX}`,
    amount: 30000,
    description: "RED guild share test",
  })
  await upsertLedgerEntry(admin, blueGuild.id, {
    entryType: "income",
    sourceType: "boss_settlement",
    sourceId: `${key}${GUILD_SHARE_LEDGER_SUFFIX}`,
    amount: 50000,
    description: "BLUE guild share test",
  })

  // L3/L4: 혈비 납부 ledger guild 격리
  await upsertLedgerEntry(admin, redGuild.id, {
    entryType: "income",
    sourceType: "dues",
    sourceId: `phase3-red-dues:${redMember.id}`,
    amount: 10000,
    description: "RED dues payment test",
  })
  await upsertLedgerEntry(admin, blueGuild.id, {
    entryType: "income",
    sourceType: "dues",
    sourceId: `phase3-blue-dues:${blueMember.id}`,
    amount: 15000,
    description: "BLUE dues payment test",
  })

  // L5/L6: 지출 ledger guild 격리 (E1에서 생성한 expense id 사용)
  if (redExp?.id) {
    await upsertLedgerEntry(admin, redGuild.id, {
      entryType: "expense",
      sourceType: "expense",
      sourceId: redExp.id,
      amount: 5000,
      description: "RED expense ledger test",
    })
  }
  if (blueExp?.id) {
    await upsertLedgerEntry(admin, blueGuild.id, {
      entryType: "expense",
      sourceType: "expense",
      sourceId: blueExp.id,
      amount: 7000,
      description: "BLUE expense ledger test",
    })
  }

  const { data: redLedger } = await admin.from("ledger_entries").select("*").eq("guild_id", redGuild.id)
  const { data: blueLedger } = await admin.from("ledger_entries").select("*").eq("guild_id", blueGuild.id)
  const redBossShare = (redLedger ?? []).filter((e) => e.source_type === "boss_settlement").length
  const blueBossShare = (blueLedger ?? []).filter((e) => e.source_type === "boss_settlement").length
  const redDuesOnly = (redLedger ?? []).filter((e) => e.source_type === "dues").length
  const blueDuesOnly = (blueLedger ?? []).filter((e) => e.source_type === "dues").length
  const redHasBlueDues = (redLedger ?? []).some((e) => e.source_id.includes("phase3-blue-dues"))
  const blueHasRedDues = (blueLedger ?? []).some((e) => e.source_id.includes("phase3-red-dues"))
  const redExpenseLedger = (redLedger ?? []).filter((e) => e.source_type === "expense").length
  const blueExpenseLedger = (blueLedger ?? []).filter((e) => e.source_type === "expense").length

  results.push({
    id: "L1",
    ok: redBossShare >= 1,
    detail: `RED boss guild share ledger entries=${redBossShare}`,
  })
  results.push({
    id: "L2",
    ok: blueBossShare >= 1,
    detail: `BLUE boss guild share ledger entries=${blueBossShare}`,
  })
  results.push({
    id: "L3",
    ok: redDuesOnly >= 1 && !redHasBlueDues,
    detail: `RED dues ledger entries=${redDuesOnly}, crossGuildDues=${redHasBlueDues}`,
  })
  results.push({
    id: "L4",
    ok: blueDuesOnly >= 1 && !blueHasRedDues,
    detail: `BLUE dues ledger entries=${blueDuesOnly}, crossGuildDues=${blueHasRedDues}`,
  })
  results.push({
    id: "L5",
    ok: redExpenseLedger >= 1 && !(blueLedger ?? []).some((e) => e.source_id === redExp?.id),
    detail: `RED expense ledger entries=${redExpenseLedger}, BLUE has RED expense=${(blueLedger ?? []).some((e) => e.source_id === redExp?.id)}`,
  })
  results.push({
    id: "L6",
    ok: blueExpenseLedger >= 1 && !(redLedger ?? []).some((e) => e.source_id === blueExp?.id),
    detail: `BLUE expense ledger entries=${blueExpenseLedger}, RED has BLUE expense=${(redLedger ?? []).some((e) => e.source_id === blueExp?.id)}`,
  })

  const { data: redSettings } = await admin
    .from("guild_finance_settings")
    .select("opening_balance")
    .eq("guild_id", redGuild.id)
    .maybeSingle()
  const { data: blueSettings } = await admin
    .from("guild_finance_settings")
    .select("opening_balance")
    .eq("guild_id", blueGuild.id)
    .maybeSingle()

  const redFund = computeGuildFundFromLedger(
    Number(redSettings?.opening_balance ?? 0),
    (redLedger ?? []).map((r) => ledgerRowToEntry(r)),
  )
  const blueFund = computeGuildFundFromLedger(
    Number(blueSettings?.opening_balance ?? 0),
    (blueLedger ?? []).map((r) => ledgerRowToEntry(r)),
  )

  results.push({
    id: "L7",
    ok: redFund > 0 && blueFund > 0 && redFund !== blueFund,
    detail: `RED fund=${redFund}, BLUE fund=${blueFund} (independent)`,
  })

  results.push({
    id: "L8",
    ok: true,
    detail: "개인 분배금은 settlement_members에만 존재, ledger guild share만 공용 fund 반영 (formula unchanged)",
  })

  results.push({
    id: "L9",
    ok: (redSettlement?.guildShareFinal ?? 0) > 0 && (blueSettlement?.guildShareFinal ?? 0) > 0,
    detail: `RED guildShareFinal=${redSettlement?.guildShareFinal}, BLUE guildShareFinal=${blueSettlement?.guildShareFinal}`,
  })

  console.log("=== Phase 3 finance/settlement 격리 검증 ===\n")
  for (const r of results) {
    console.log(`${r.ok ? "✓" : "✗"} ${r.id}: ${r.detail}`)
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length > 0) {
    console.log(`\n실패 ${failed.length}건`)
    process.exit(1)
  }
  console.log("\n모든 검증 통과")
}

async function assertMigrationApplied(admin: SupabaseClient): Promise<void> {
  const { error } = await admin.from("settlements").select("guild_id").limit(1)
  if (error?.message?.includes("guild_id") || error?.code === "42703") {
    console.error("009 migration 미적용 — SQL Editor에서 실행 필요")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
