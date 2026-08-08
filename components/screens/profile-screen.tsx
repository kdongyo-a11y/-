"use client"

import { useEffect, useState } from "react"
import { SectionTitle, Badge, Card } from "@/components/ui-bits"
import { useAuth, useCurrentMemberId } from "@/components/auth-context"
import { useMembers } from "@/components/members-context"
import { useDues } from "@/components/dues-context"
import { useSettlement } from "@/components/settlement-context"
import { useMemberContribution, getThisMonthPeriod } from "@/components/use-contribution"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_POSITION_LABELS,
  MEMBER_ROLE_LABELS,
  MEMBER_STATUS_LABELS,
  type MemberCharacterClass,
} from "@/lib/member-types"
import { formatMemberProfile } from "@/lib/member-utils"
import { formatWon } from "@/lib/guild-data"
import { DUES_PAYMENT_STATUS_LABELS } from "@/lib/dues-types"
import { Bell, ChevronRight, KeyRound, LogOut, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { ProfileChangePasswordModal } from "@/components/profile-change-password-modal"

const menu = [
  { icon: KeyRound, label: "비밀번호 변경", value: "", action: "change-password" as const },
]

export function ProfileScreen() {
  const { logout, changePasswordWithCurrent } = useAuth()
  const memberId = useCurrentMemberId()
  const { getMember, updateOwnProfile } = useMembers()
  const { getMemberDuesHistory, activeBillId, getPaymentStatus } = useDues()
  const { getMemberReceivedPayoutTotal } = useSettlement()
  const user = getMember(memberId)
  const period = getThisMonthPeriod()
  const contribution = useMemberContribution(memberId, period)
  const [showContributionDetail, setShowContributionDetail] = useState(false)

  const [characterClass, setCharacterClass] = useState<MemberCharacterClass>("기사")
  const [level, setLevel] = useState("1")
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [showPasswordModal, setShowPasswordModal] = useState(false)

  useEffect(() => {
    if (!user) return
    setCharacterClass(user.characterClass)
    setLevel(String(user.level))
  }, [user])

  if (!user) return null

  const totalPayout = getMemberReceivedPayoutTotal(memberId)
  const duesStatus = activeBillId ? getPaymentStatus(memberId, activeBillId) : null
  const duesHistory = getMemberDuesHistory(memberId)

  const profileDirty =
    characterClass !== user.characterClass || parseInt(level, 10) !== user.level

  async function handleSaveProfile() {
    const parsedLevel = parseInt(level, 10)
    const result = await updateOwnProfile(memberId, {
      characterClass,
      level: parsedLevel,
    })
    if (!result.ok) {
      setSaveMessage(result.message)
    } else {
      setSaveMessage(null)
    }
  }

  return (
    <div>
      <SectionTitle>내 정보</SectionTitle>

      <Card className="flex items-center gap-3.5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
          {user.nickname.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-base font-semibold text-foreground">{user.nickname}</p>
            <Badge tone="primary">{MEMBER_ROLE_LABELS[user.role]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{formatMemberProfile(user)}</p>
        </div>
      </Card>

      <SectionTitle>프로필 수정</SectionTitle>
      <Card className="mb-3 flex flex-col gap-3">
        <ReadOnlyField label="캐릭터명" value={user.nickname} hint="등록 후 변경할 수 없습니다" />
        <label className="block text-xs font-medium text-muted-foreground">
          클래스
          <select
            value={characterClass}
            onChange={(e) => setCharacterClass(e.target.value as MemberCharacterClass)}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
          >
            {MEMBER_CHARACTER_CLASSES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-muted-foreground">
          레벨
          <input
            type="number"
            min={1}
            max={999}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
          />
        </label>
        <ReadOnlyField label="직책" value={MEMBER_POSITION_LABELS[user.position]} />
        <ReadOnlyField label="상태" value={MEMBER_STATUS_LABELS[user.status]} />
        <ReadOnlyField label="권한" value={MEMBER_ROLE_LABELS[user.role]} />
        <ReadOnlyField label="가입일" value={user.joinDate} />
        {saveMessage && (
          <p className="text-xs text-destructive">{saveMessage}</p>
        )}
        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={!profileDirty}
          className={cn(
            "rounded-xl py-2.5 text-sm font-semibold",
            profileDirty
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground",
          )}
        >
          저장
        </button>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-3">
        <MiniStat label="이번 달 기여" value={`${contribution.breakdown.total}점`} />
        <MiniStat label="누적 분배" value={Math.round(totalPayout / 10000) + "만"} />
        <MiniStat
          label="혈비"
          value={duesStatus ? DUES_PAYMENT_STATUS_LABELS[duesStatus] : "-"}
        />
      </div>

      <SectionTitle
        action={
          <button type="button" onClick={() => setShowContributionDetail((v) => !v)} className="text-xs text-primary">
            {showContributionDetail ? "접기" : "상세보기"}
          </button>
        }
      >
        이번 달 기여도
      </SectionTitle>
      <Card className="mb-3 space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">일반</span><span>{contribution.breakdown.generalPoints}점</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">메인</span><span>{contribution.breakdown.mainPoints}점</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">공성</span><span>{contribution.breakdown.siegePoints}점</span></div>
        <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>총</span><span className="text-primary">{contribution.breakdown.total}점</span></div>
      </Card>
      {showContributionDetail && (
        <div className="mb-3 flex flex-col gap-2">
          {contribution.events.map((e) => (
            <Card key={e.id} className="flex justify-between py-2.5 text-xs">
              <span>{e.sub}</span>
              <span className="font-semibold text-primary">+{e.points}</span>
            </Card>
          ))}
        </div>
      )}

      {duesHistory.length > 0 && (
        <>
          <SectionTitle>혈비 납부 내역</SectionTitle>
          <div className="mb-3 flex flex-col gap-2">
            {duesHistory.map(({ bill, status }) => (
              <Card key={bill.id} className="flex justify-between py-2.5 text-xs">
                <span>{bill.title}</span>
                <Badge tone={status === "PAID" ? "success" : "danger"}>
                  {DUES_PAYMENT_STATUS_LABELS[status]}
                </Badge>
              </Card>
            ))}
          </div>
        </>
      )}

      <SectionTitle>계정 / 설정</SectionTitle>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">알림 설정</p>
            <p className="text-xs text-muted-foreground">추후 업데이트 예정</p>
          </div>
        </div>
        {menu.map(({ icon: Icon, label, value, action }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (action === "change-password") setShowPasswordModal(true)
            }}
            className={cn(
              "flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left transition-colors hover:bg-accent",
            )}
          >
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm text-foreground">{label}</span>
            {value && <span className="text-xs text-muted-foreground">{value}</span>}
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <ProfileChangePasswordModal
        open={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        onSubmit={changePasswordWithCurrent}
      />

      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
        <Shield className="h-4 w-4" />
        누적 분배금 총액 {formatWon(totalPayout)}
      </div>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </button>
    </div>
  )
}

function ReadOnlyField({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-center">
      <p className="text-sm font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{label}</p>
    </div>
  )
}
