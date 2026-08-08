"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { Shield } from "lucide-react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { initialDataNav } from "@/components/admin/admin-nav-helpers"
import { useGuildProfile } from "@/components/guild-profile-context"
import { MAX_GUILD_MARK_BYTES } from "@/lib/guild-profile-constants"

type Props = {
  onNavigate: (nav: AdminNavState) => void
}

export function AdminGuildProfileView({ onNavigate }: Props) {
  const { profile, applyProfile, isProfilePending } = useGuildProfile()
  const [uploadingMark, setUploadingMark] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  const handleUploadMark = useCallback(async () => {
    if (!selectedFile) {
      alert("변경할 이미지를 선택해주세요.")
      return
    }
    if (selectedFile.size > MAX_GUILD_MARK_BYTES) {
      alert("파일 크기는 2MB 이하여야 합니다.")
      return
    }

    setUploadingMark(true)
    const formData = new FormData()
    formData.append("file", selectedFile)

    const res = await fetch("/api/admin/guild-profile/mark", {
      method: "POST",
      body: formData,
    })
    const data = (await res.json()) as {
      ok: boolean
      message?: string
      profile?: {
        guildName: string
        guildMarkUrl: string | null
        guildMarkPath: string | null
        serverId?: string
        serverName?: string
      }
    }
    setUploadingMark(false)

    if (!data.ok) {
      alert(data.message ?? "혈맹마크 변경에 실패했습니다.")
      return
    }

    if (data.profile) {
      applyProfile({
        guildName: data.profile.guildName ?? profile?.guildName ?? "",
        guildMarkUrl: data.profile.guildMarkUrl,
        guildMarkPath: data.profile.guildMarkPath,
        serverId: data.profile.serverId ?? profile?.serverId ?? "",
        serverName: data.profile.serverName ?? profile?.serverName ?? "",
      })
    }
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
    alert(data.message ?? "혈맹마크가 변경되었습니다.")
  }, [applyProfile, profile, selectedFile])

  const displayMarkUrl = previewUrl ?? profile?.guildMarkUrl

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "기초데이터 관리", onClick: () => onNavigate(initialDataNav()) },
          { label: "혈맹마크 관리" },
        ]}
      />
      <SectionTitle>혈맹마크 관리</SectionTitle>
      <p className="mb-4 text-xs text-muted-foreground">
        혈맹명({profile?.guildName ?? "…"}) · {profile?.serverName ?? "…"} 서버 — 마크만 변경할 수
        있습니다.
      </p>

      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">혈맹마크</p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground">현재 혈맹마크</p>
          <div className="relative mx-auto mt-3 flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted">
            {displayMarkUrl ? (
              <Image
                src={displayMarkUrl}
                alt={`${profile?.guildName ?? "혈맹"} 혈마크`}
                fill
                className="object-cover"
                unoptimized
              />
            ) : (
              <Shield className="h-8 w-8 text-muted-foreground" strokeWidth={1.8} />
            )}
          </div>
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-xl border border-border py-2.5 text-sm font-medium"
          >
            이미지 선택
          </button>
          {selectedFile && (
            <p className="mt-2 text-xs text-muted-foreground">
              선택: {selectedFile.name} ({Math.round(selectedFile.size / 1024)}KB)
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleUploadMark()}
            disabled={uploadingMark || !selectedFile || isProfilePending}
            className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {uploadingMark ? "업로드 중…" : "변경"}
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            PNG · JPG · WEBP, 최대 2MB. 정사각형 이미지를 권장합니다.
          </p>
        </div>
      </Card>
    </div>
  )
}
