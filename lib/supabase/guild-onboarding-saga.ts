import { randomUUID } from "crypto"
import type { SupabaseClient } from "@supabase/supabase-js"
import { buildInternalAuthEmail } from "@/lib/auth-constants"
import {
  CONTRIBUTION_GENERAL,
  CONTRIBUTION_MAIN,
  CONTRIBUTION_SIEGE,
} from "@/lib/boss-time-slots"
import {
  generateInternalGuildCode,
  isValidGuildName,
  normalizeGuildName,
  rowToGuild,
  type GuildRow,
} from "@/lib/guild-types"
import { isActiveGameServer } from "@/lib/supabase/game-server-data"
import { rowToMember, type MemberRow } from "@/lib/supabase/member-mapper"

export type CreateGuildInput = {
  serverId: string
  guildName: string
  adminNickname: string
  password: string
}

export type CreateGuildResult =
  | {
      ok: true
      guild: ReturnType<typeof rowToGuild>
      adminMember: ReturnType<typeof rowToMember>
    }
  | { ok: false; message: string; status: number }

type SagaState = {
  guildId?: string
  memberId?: string
  authUserId?: string
}

const DEFAULT_CONTRIBUTION_EFFECTIVE_FROM = "2000-01-01"

function validateInput(input: CreateGuildInput): { ok: true; guildName: string } | { ok: false; message: string } {
  const guildName = normalizeGuildName(input.guildName)
  const adminNickname = input.adminNickname.trim()
  const password = input.password

  if (!input.serverId) return { ok: false, message: "서버를 선택해주세요." }
  if (!isValidGuildName(guildName)) {
    return {
      ok: false,
      message: "혈맹명은 2~32자의 한글, 영문, 숫자로 입력해주세요.",
    }
  }
  if (!adminNickname) return { ok: false, message: "관리자 캐릭터명을 입력해주세요." }
  if (!password || password.length < 8) {
    return { ok: false, message: "비밀번호는 8자 이상이어야 합니다." }
  }

  return { ok: true, guildName }
}

async function compensateOnboarding(admin: SupabaseClient, state: SagaState): Promise<void> {
  if (state.authUserId) {
    await admin.auth.admin.deleteUser(state.authUserId).catch(() => {})
  }

  if (state.guildId) {
    await admin.from("contribution_score_settings").delete().eq("guild_id", state.guildId)
    await admin.from("guild_finance_settings").delete().eq("guild_id", state.guildId)
    if (state.memberId) {
      await admin.from("members").delete().eq("id", state.memberId)
    }
    await admin.from("guilds").delete().eq("id", state.guildId)
  }
}

async function resolveUniqueInternalGuildCode(
  admin: SupabaseClient,
  serverId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateInternalGuildCode()
    const { data } = await admin
      .from("guilds")
      .select("id")
      .eq("server_id", serverId)
      .eq("guild_code", code)
      .maybeSingle()
    if (!data) return code
  }
  throw new Error("internal guild_code 생성 실패")
}

export async function createGuildOnboarding(
  admin: SupabaseClient,
  input: CreateGuildInput,
): Promise<CreateGuildResult> {
  const validation = validateInput(input)
  if (!validation.ok) {
    return { ok: false, message: validation.message, status: 400 }
  }

  const guildName = validation.guildName
  const serverId = input.serverId
  const adminNickname = input.adminNickname.trim()
  const password = input.password

  const serverActive = await isActiveGameServer(admin, serverId)
  if (!serverActive) {
    return { ok: false, message: "유효하지 않은 서버입니다.", status: 400 }
  }

  const { data: existingGuild } = await admin
    .from("guilds")
    .select("id")
    .eq("server_id", serverId)
    .eq("guild_name", guildName)
    .maybeSingle()

  if (existingGuild) {
    return { ok: false, message: "이미 사용 중인 혈맹명입니다.", status: 409 }
  }

  if (adminNickname.length > 32) {
    return { ok: false, message: "캐릭터명은 32자 이내로 입력해주세요.", status: 400 }
  }

  const state: SagaState = {}
  state.memberId = randomUUID()

  try {
    const internalGuildCode = await resolveUniqueInternalGuildCode(admin, serverId)

    const { data: guildRow, error: guildError } = await admin
      .from("guilds")
      .insert({
        server_id: serverId,
        guild_name: guildName,
        guild_code: internalGuildCode,
        status: "provisioning",
      })
      .select("*")
      .single()

    if (guildError || !guildRow) {
      throw guildError ?? new Error("guild 생성 실패")
    }

    state.guildId = (guildRow as GuildRow).id

    const internalEmail = buildInternalAuthEmail(state.memberId)
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
    })

    if (authError || !authData.user) {
      throw authError ?? new Error("Auth admin user 생성 실패")
    }

    state.authUserId = authData.user.id

    const { error: memberError } = await admin.from("members").insert({
      id: state.memberId,
      guild_id: state.guildId,
      auth_user_id: state.authUserId,
      internal_email: internalEmail,
      nickname: adminNickname,
      class_name: "군주",
      level: 1,
      position: "군주",
      join_date: new Date().toISOString().slice(0, 10),
      status: "활동",
      role: "admin",
      account_status: "active",
      must_change_password: false,
    })

    if (memberError) throw memberError

    const { error: financeError } = await admin.from("guild_finance_settings").insert({
      guild_id: state.guildId,
      opening_balance: 0,
    })

    if (financeError) throw financeError

    const { error: contributionError } = await admin.from("contribution_score_settings").insert({
      guild_id: state.guildId,
      general_boss_score: CONTRIBUTION_GENERAL,
      main_boss_score: CONTRIBUTION_MAIN,
      siege_score: CONTRIBUTION_SIEGE,
      effective_from: DEFAULT_CONTRIBUTION_EFFECTIVE_FROM,
      created_by: state.memberId,
    })

    if (contributionError) throw contributionError

    const { data: activeGuild, error: activateError } = await admin
      .from("guilds")
      .update({ status: "active" })
      .eq("id", state.guildId)
      .select("*")
      .single()

    if (activateError || !activeGuild) {
      throw activateError ?? new Error("guild 활성화 실패")
    }

    const { data: memberRow, error: fetchMemberError } = await admin
      .from("members")
      .select("*")
      .eq("id", state.memberId)
      .single()

    if (fetchMemberError || !memberRow) {
      throw fetchMemberError ?? new Error("admin member 조회 실패")
    }

    return {
      ok: true,
      guild: rowToGuild(activeGuild as GuildRow),
      adminMember: rowToMember(memberRow as MemberRow),
    }
  } catch (error) {
    console.error("[createGuildOnboarding] saga failed", {
      guildId: state.guildId,
      memberId: state.memberId,
      hasAuthUser: !!state.authUserId,
    })
    await compensateOnboarding(admin, state)
    return { ok: false, message: "혈맹 생성 중 오류가 발생했습니다.", status: 500 }
  }
}
