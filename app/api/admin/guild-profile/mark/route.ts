import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireAdmin } from "@/lib/supabase/operation-auth"
import { actorGuildId } from "@/lib/supabase/guild-scope-helpers"
import {
  ALLOWED_GUILD_MARK_MIME_TYPES,
  GUILD_ASSETS_BUCKET,
  MAX_GUILD_MARK_BYTES,
  buildGuildMarkStoragePath,
  guildMarkExtensionForMime,
} from "@/lib/guild-profile-constants"
import {
  fetchGuildProfile,
  removeGuildMarkObject,
  updateGuildMarkPathOnServer,
} from "@/lib/supabase/guild-profile-data"

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

    const adminCheck = requireAdmin(authResult.member)
    if (!adminCheck.ok) {
      return NextResponse.json(
        { ok: false, message: adminCheck.message },
        { status: adminCheck.status },
      )
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: "이미지 파일을 선택해주세요." }, { status: 400 })
    }

    if (!ALLOWED_GUILD_MARK_MIME_TYPES.includes(file.type as (typeof ALLOWED_GUILD_MARK_MIME_TYPES)[number])) {
      return NextResponse.json(
        { ok: false, message: "PNG, JPG, WEBP 형식만 업로드할 수 있습니다." },
        { status: 400 },
      )
    }

    if (file.size <= 0 || file.size > MAX_GUILD_MARK_BYTES) {
      return NextResponse.json(
        { ok: false, message: "파일 크기는 2MB 이하여야 합니다." },
        { status: 400 },
      )
    }

    const ext = guildMarkExtensionForMime(file.type)
    if (!ext) {
      return NextResponse.json({ ok: false, message: "지원하지 않는 이미지 형식입니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const guildId = actorGuildId(authResult.member)
    const previous = await fetchGuildProfile(admin, guildId)
    const objectPath = buildGuildMarkStoragePath(guildId, ext)
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await admin.storage
      .from(GUILD_ASSETS_BUCKET)
      .upload(objectPath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (uploadError) {
      console.error("[admin/guild-profile/mark/upload]", uploadError)
      return NextResponse.json(
        { ok: false, message: "혈맹마크 업로드에 실패했습니다." },
        { status: 500 },
      )
    }

    const updateResult = await updateGuildMarkPathOnServer(admin, guildId, objectPath)

    if (!updateResult.ok) {
      await admin.storage.from(GUILD_ASSETS_BUCKET).remove([objectPath])
      return NextResponse.json({ ok: false, message: updateResult.message }, { status: 500 })
    }

    if (previous?.guildMarkPath && previous.guildMarkPath !== objectPath) {
      await removeGuildMarkObject(admin, guildId, previous.guildMarkPath)
    }

    return NextResponse.json({
      ok: true,
      message: "혈맹마크가 변경되었습니다.",
      profile: updateResult.profile,
    })
  } catch (error) {
    console.error("[admin/guild-profile/mark]", error)
    return NextResponse.json(
      { ok: false, message: "혈맹마크 변경 중 오류가 발생했습니다." },
      { status: 500 },
    )
  }
}
