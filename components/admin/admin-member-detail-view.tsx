"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, SectionTitle } from "@/components/ui-bits"
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb"
import type { AdminNavState } from "@/components/admin/admin-types"
import { useAuth } from "@/components/auth-context"
import { useMembers } from "@/components/members-context"
import { useDues } from "@/components/dues-context"
import { useSettlement } from "@/components/settlement-context"
import { getThisMonthPeriod } from "@/components/use-contribution"
import { MemberActivitySection } from "@/components/admin/member-activity-section"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITION_LABELS,
  MEMBER_ROLE_LABELS,
  MEMBER_STATUS_LABELS,
  MEMBER_ACCOUNT_STATUS_LABELS,
  MEMBER_ACCOUNT_STATUSES,
  MEMBER_POSITIONS,
  MEMBER_STATUSES,
  MEMBER_PROGRAM_ROLES,
  type Member,
  type MemberAccountStatus,
  type MemberCharacterClass,
  type MemberPosition,
  type MemberProgramRole,
  type MemberStatus,
} from "@/lib/member-types"
import { getMemberReceivedPayoutAmount } from "@/lib/settlement-revision-utils"
import { formatMemberProfile } from "@/lib/member-utils"
import { formatWon } from "@/lib/guild-data"
import { DUES_PAYMENT_STATUS_LABELS } from "@/lib/dues-types"
import {
  Field,
  InfoRow,
  ReadOnlyField,
  SelectField,
} from "@/components/admin/admin-member-form-parts"

type Props = {
  memberId: string
  onNavigate: (nav: AdminNavState) => void
}

export function AdminMemberDetailView({ memberId, onNavigate }: Props) {
  const { getMember, members, updateMember, resetMemberPassword } = useMembers()
  const { currentMemberId, canManageRoles } = useAuth()
  const { getPaymentStatus, activeBillId, bills } = useDues()
  const { getMemberSettlements } = useSettlement()

  const member = getMember(memberId)
  const period = getThisMonthPeriod()
  const settlements = getMemberSettlements(memberId)

  const adminCount = useMemo(
    () => members.filter((m) => m.role === "admin").length,
    [members],
  )

  const [editMode, setEditMode] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [form, setForm] = useState({
    characterClass: "기사" as MemberCharacterClass,
    level: "1",
    position: "일반" as MemberPosition,
    joinDate: "",
    status: "활동" as MemberStatus,
    role: "member" as MemberProgramRole,
    accountStatus: "active" as MemberAccountStatus,
  })

  useEffect(() => {
    if (!member) return
    setForm({
      characterClass: member.characterClass,
      level: String(member.level),
      position: member.position,
      joinDate: member.joinDate,
      status: member.status,
      role: member.role,
      accountStatus: member.accountStatus ?? "active",
    })
  }, [member])

  if (!member) {
    return (
      <div>
        <AdminBreadcrumb
          items={[
            { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
            { label: "혈맹원 관리", onClick: () => onNavigate({ section: "members" }) },
            { label: "찾을 수 없음" },
          ]}
        />
        <p className="py-10 text-center text-sm text-muted-foreground">
          혈맹원을 찾을 수 없습니다.
        </p>
      </div>
    )
  }

  const monthPayout = settlements
    .filter((s) => {
      const d = new Date(s.settlement.createdAt).toISOString().slice(0, 7)
      return d === period.start.slice(0, 7)
    })
    .reduce((sum, s) => sum + getMemberReceivedPayoutAmount(s.participant), 0)
  const totalPayout = settlements.reduce(
    (sum, s) => sum + getMemberReceivedPayoutAmount(s.participant),
    0,
  )
  const activeBill = bills.find((b) => b.id === activeBillId)
  const duesStatus = activeBillId ? getPaymentStatus(member.id, activeBillId) : null

  async function save() {
    const payload: Parameters<typeof updateMember>[1] = {
      characterClass: form.characterClass,
      level: parseInt(form.level, 10),
      position: form.position,
      joinDate: form.joinDate,
      status: form.status,
    }

    if (canManageRoles) {
      if (
        member!.role === "admin" &&
        form.role !== "admin" &&
        adminCount <= 1
      ) {
        alert(
          "최고관리자가 한 명뿐입니다. 다른 혈맹원에게 최고관리자 권한을 부여한 뒤 변경해주세요.",
        )
        return
      }
      payload.role = form.role
      payload.accountStatus = form.accountStatus
    }

    const r = await updateMember(member!.id, payload, "관리자 기본정보 수정", currentMemberId ?? undefined)
    alert(r.message)
    if (r.ok) setEditMode(false)
  }

  async function handleResetPassword() {
    setResetting(true)
    const r = await resetMemberPassword(member!.id)
    setResetting(false)
    setShowResetConfirm(false)
    alert(r.message)
  }

  return (
    <div>
      <AdminBreadcrumb
        items={[
          { label: "관리자", onClick: () => onNavigate({ section: "home" }) },
          { label: "혈맹원 관리", onClick: () => onNavigate({ section: "members" }) },
          { label: member.nickname },
        ]}
      />

      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-lg font-semibold">
            {member.nickname.slice(0, 1)}
          </div>
          <div>
            <p className="text-lg font-semibold">{member.nickname}</p>
            <p className="text-xs text-muted-foreground">{formatMemberProfile(member)}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              캐릭터명은 등록 후 고정 식별정보입니다
            </p>
          </div>
        </div>
      </Card>

      <SectionTitle
        action={
          <button type="button" onClick={() => setEditMode((v) => !v)} className="text-xs text-primary">
            {editMode ? "취소" : "수정"}
          </button>
        }
      >
        기본정보
      </SectionTitle>

      {editMode ? (
        <Card className="mb-4 flex flex-col gap-3">
          <ReadOnlyField label="캐릭터명" value={member.nickname} />
          <SelectField
            label="클래스"
            value={form.characterClass}
            options={MEMBER_CHARACTER_CLASSES}
            onChange={(v) => setForm({ ...form, characterClass: v as MemberCharacterClass })}
          />
          <Field label="레벨" value={form.level} onChange={(v) => setForm({ ...form, level: v })} />
          <SelectField
            label="직책"
            value={form.position}
            options={MEMBER_POSITIONS}
            onChange={(v) => setForm({ ...form, position: v as MemberPosition })}
          />
          <Field label="가입일" value={form.joinDate} onChange={(v) => setForm({ ...form, joinDate: v })} />
          <SelectField
            label="혈맹 상태"
            value={form.status}
            options={MEMBER_STATUSES}
            onChange={(v) => setForm({ ...form, status: v as MemberStatus })}
          />
          {canManageRoles ? (
            <>
              <SelectField
                label="프로그램 권한"
                value={form.role}
                options={MEMBER_PROGRAM_ROLES}
                labels={MEMBER_ROLE_LABELS}
                onChange={(v) => setForm({ ...form, role: v as MemberProgramRole })}
              />
              <SelectField
                label="계정 상태"
                value={form.accountStatus}
                options={MEMBER_ACCOUNT_STATUSES}
                labels={MEMBER_ACCOUNT_STATUS_LABELS}
                onChange={(v) => setForm({ ...form, accountStatus: v as MemberAccountStatus })}
              />
              {member.role === "admin" && form.role !== "admin" && adminCount <= 1 && (
                <p className="text-xs text-warning">
                  현재 최고관리자가 한 명뿐입니다. 권한 변경 시 관리 기능을 사용할 수 없게 될 수 있습니다.
                </p>
              )}
            </>
          ) : (
            <>
              <ReadOnlyField label="프로그램 권한" value={MEMBER_ROLE_LABELS[member.role]} />
              <ReadOnlyField
                label="계정 상태"
                value={MEMBER_ACCOUNT_STATUS_LABELS[member.accountStatus ?? "active"]}
              />
            </>
          )}
          <button
            type="button"
            onClick={() => void save()}
            className="rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            저장
          </button>
        </Card>
      ) : (
        <Card className="mb-4 space-y-2 text-sm">
          <InfoRow label="캐릭터명" value={member.nickname} />
          <InfoRow label="클래스" value={member.characterClass} />
          <InfoRow label="레벨" value={`Lv.${member.level}`} />
          <InfoRow label="직책" value={MEMBER_POSITION_LABELS[member.position]} />
          <InfoRow label="가입일" value={member.joinDate} />
          <InfoRow label="혈맹 상태" value={MEMBER_STATUS_LABELS[member.status]} />
          <InfoRow label="프로그램 권한" value={MEMBER_ROLE_LABELS[member.role]} />
          <InfoRow
            label="계정 상태"
            value={MEMBER_ACCOUNT_STATUS_LABELS[member.accountStatus ?? "active"]}
          />
        </Card>
      )}

      <SectionTitle>재정 현황</SectionTitle>
      <Card className="mb-4 space-y-2 text-sm">
        <InfoRow label="이번 달 분배금" value={formatWon(monthPayout)} />
        <InfoRow label="누적 분배금" value={formatWon(totalPayout)} />
        <InfoRow
          label={activeBill?.title ?? "이번 달 혈비"}
          value={duesStatus ? DUES_PAYMENT_STATUS_LABELS[duesStatus] : "대상 아님"}
        />
      </Card>

      <MemberActivitySection memberId={member.id} />

      {canManageRoles && (
        <>
          <SectionTitle>계정 관리</SectionTitle>
          <Card className="mb-4">
            <p className="mb-3 text-xs text-muted-foreground">
              현재 비밀번호는 조회할 수 없습니다. 초기화 시 다음 로그인에서 새 비밀번호 설정이 필요합니다.
            </p>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="w-full rounded-xl border border-destructive/40 bg-destructive/10 py-2.5 text-sm font-semibold text-destructive"
            >
              비밀번호 초기화
            </button>
          </Card>
        </>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-lg">
            <p className="text-sm leading-relaxed text-foreground">
              {member.nickname}님의 비밀번호를 초기화하시겠습니까?
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              초기 비밀번호는 1234로 변경되며,
              <br />
              다음 로그인 시 새 비밀번호 설정이 필요합니다.
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="flex-1 rounded-xl border py-2.5 text-sm text-muted-foreground"
              >
                취소
              </button>
              <button
                type="button"
                onClick={() => void handleResetPassword()}
                disabled={resetting}
                className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-semibold text-destructive-foreground"
              >
                초기화
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
