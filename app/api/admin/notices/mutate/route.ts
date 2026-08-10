import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  archiveGuildNoticeOnServer,
  createGuildNoticeOnServer,
  fetchAdminNoticesView,
  updateGuildNoticeOnServer,
} from "@/lib/supabase/notices-data"
import {
  effectiveFromNowIso,
  kstLocalDateTimeToIso,
} from "@/lib/operation-policy-kst-utils"

type Body = {
  action?: "create" | "update" | "archive"
  noticeId?: string
  title?: string
  content?: string
  isImportant?: boolean
  publishFromMode?: "now" | "scheduled"
  publishFromDate?: string
  publishFromTime?: string
  publishUntilDate?: string | null
  publishUntilTime?: string | null
}

function resolvePublishFromIso(body: Body): { ok: true; iso: string } | { ok: false; message: string } {
  if (body.publishFromMode === "scheduled") {
    if (!body.publishFromDate || !body.publishFromTime) {
      return { ok: false, message: "게시 시작 날짜와 시간을 입력해주세요." }
    }
    try {
      return { ok: true, iso: kstLocalDateTimeToIso(body.publishFromDate, body.publishFromTime) }
    } catch {
      return { ok: false, message: "게시 시작 날짜/시간 형식이 올바르지 않습니다." }
    }
  }
  return { ok: true, iso: effectiveFromNowIso() }
}

function resolvePublishUntilIso(
  body: Body,
): { ok: true; iso: string | null } | { ok: false; message: string } {
  if (!body.publishUntilDate) {
    return { ok: true, iso: null }
  }
  const time = body.publishUntilTime ?? "23:59"
  try {
    return { ok: true, iso: kstLocalDateTimeToIso(body.publishUntilDate, time) }
  } catch {
    return { ok: false, message: "게시 종료 날짜/시간 형식이 올바르지 않습니다." }
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ("error" in authResult) {
      return NextResponse.json(
        { ok: false, message: authResult.error },
        { status: authResult.status },
      )
    }

    const roleCheck = requireManagerOrAdmin(authResult.member)
    if (!roleCheck.ok) {
      return NextResponse.json(
        { ok: false, message: roleCheck.message },
        { status: roleCheck.status },
      )
    }

    const body = (await request.json()) as Body
    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const isAdmin = authResult.member.role === "admin"

    if (body.action === "archive") {
      if (!body.noticeId) {
        return NextResponse.json({ ok: false, message: "noticeId가 필요합니다." }, { status: 400 })
      }
      const result = await archiveGuildNoticeOnServer(admin, guildId, body.noticeId)
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
      }
      const notices = await fetchAdminNoticesView(admin, guildId)
      return NextResponse.json({ ok: true, message: "공지가 보관되었습니다.", notices })
    }

    if (body.isImportant && !isAdmin) {
      return NextResponse.json(
        { ok: false, message: "중요 공지 지정은 최고관리자만 가능합니다." },
        { status: 403 },
      )
    }

    const publishFrom = resolvePublishFromIso(body)
    if (!publishFrom.ok) {
      return NextResponse.json({ ok: false, message: publishFrom.message }, { status: 400 })
    }

    const publishUntil = resolvePublishUntilIso(body)
    if (!publishUntil.ok) {
      return NextResponse.json({ ok: false, message: publishUntil.message }, { status: 400 })
    }

    const payload = {
      title: body.title ?? "",
      content: body.content ?? "",
      isImportant: isAdmin ? !!body.isImportant : false,
      publishFromIso: publishFrom.iso,
      publishUntilIso: publishUntil.iso,
    }

    if (body.action === "update") {
      if (!body.noticeId) {
        return NextResponse.json({ ok: false, message: "noticeId가 필요합니다." }, { status: 400 })
      }
      const result = await updateGuildNoticeOnServer(admin, guildId, body.noticeId, payload)
      if (!result.ok) {
        return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
      }
      const notices = await fetchAdminNoticesView(admin, guildId)
      return NextResponse.json({ ok: true, message: "공지가 수정되었습니다.", notices })
    }

    if (body.action !== "create") {
      return NextResponse.json({ ok: false, message: "알 수 없는 요청입니다." }, { status: 400 })
    }

    const result = await createGuildNoticeOnServer(admin, authResult.member.id, guildId, payload)
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    const notices = await fetchAdminNoticesView(admin, guildId)
    return NextResponse.json({ ok: true, message: "공지가 등록되었습니다.", notices })
  } catch (error) {
    console.error("[admin/notices/mutate]", error)
    return NextResponse.json(
      { ok: false, message: "공지 저장 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
