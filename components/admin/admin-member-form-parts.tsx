"use client"

import { useState } from "react"
import { Card } from "@/components/ui-bits"
import {
  MEMBER_CHARACTER_CLASSES,
  MEMBER_PROGRAM_ROLES,
  MEMBER_ROLE_LABELS,
  MEMBER_STATUSES,
  MEMBER_POSITIONS,
  type MemberCharacterClass,
  type MemberPosition,
  type MemberProgramRole,
  type MemberStatus,
} from "@/lib/member-types"
import { INITIAL_MEMBER_PASSWORD } from "@/lib/auth-constants"

export function AddMemberForm({
  onCancel,
  onSubmit,
  canManageRoles,
}: {
  onCancel: () => void
  onSubmit: (input: {
    nickname: string
    characterClass: MemberCharacterClass
    level: number
    position: MemberPosition
    joinDate?: string
    status?: MemberStatus
    role?: MemberProgramRole
  }) => void | Promise<void>
  canManageRoles: boolean
}) {
  const [nickname, setNickname] = useState("")
  const [characterClass, setCharacterClass] = useState<MemberCharacterClass>("기사")
  const [level, setLevel] = useState("50")
  const [position, setPosition] = useState<MemberPosition>("일반")
  const [joinDate, setJoinDate] = useState(new Date().toISOString().slice(0, 10))
  const [status, setStatus] = useState<MemberStatus>("활동")
  const [role, setRole] = useState<MemberProgramRole>("member")

  return (
    <Card className="mb-4 flex flex-col gap-3">
      <Field label="캐릭터명 *" value={nickname} onChange={setNickname} />
      <SelectField
        label="클래스 *"
        value={characterClass}
        options={MEMBER_CHARACTER_CLASSES}
        onChange={(v) => setCharacterClass(v as MemberCharacterClass)}
      />
      <Field label="레벨 *" value={level} onChange={setLevel} />
      <SelectField
        label="직책 *"
        value={position}
        options={MEMBER_POSITIONS}
        onChange={(v) => setPosition(v as MemberPosition)}
      />
      <Field label="가입일" value={joinDate} onChange={setJoinDate} />
      <SelectField
        label="상태"
        value={status}
        options={MEMBER_STATUSES}
        onChange={(v) => setStatus(v as MemberStatus)}
      />
      {canManageRoles && (
        <SelectField
          label="프로그램 권한"
          value={role}
          options={MEMBER_PROGRAM_ROLES}
          labels={MEMBER_ROLE_LABELS}
          onChange={(v) => setRole(v as MemberProgramRole)}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        등록 시 로그인 계정이 자동 생성됩니다. 초기 비밀번호: {INITIAL_MEMBER_PASSWORD} (최초 로그인 후 변경)
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border py-2.5 text-sm text-muted-foreground"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() =>
            void onSubmit({
              nickname,
              characterClass,
              level: parseInt(level, 10),
              position,
              joinDate,
              status,
              role,
            })
          }
          className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
        >
          등록
        </button>
      </div>
    </Card>
  )
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 rounded-xl border border-border bg-secondary/50 px-3 py-2 text-sm text-foreground">
        {value}
      </p>
    </div>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm text-foreground"
      />
    </label>
  )
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  labels?: Record<string, string>
  onChange: (v: T) => void
}) {
  return (
    <label className="block text-xs font-medium text-muted-foreground">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-1 w-full rounded-xl border border-border bg-input px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? o}
          </option>
        ))}
      </select>
    </label>
  )
}

export function InfoRow({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "font-medium text-primary" : "font-medium"}>{value}</span>
    </div>
  )
}
