"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  type AdminChangeLog,
  type Member,
  type MemberCharacterClass,
  type MemberProgramRole,
  type MemberStatus,
  type RosterMember,
  MEMBER_CHARACTER_CLASSES,
} from "@/lib/member-types"
import { isValidMemberLevel } from "@/lib/member-utils"
import { getMemberStats } from "@/lib/member-seed"
import { tryCreateClient } from "@/lib/supabase/client"
import { rowToMember, type MemberRow } from "@/lib/supabase/member-mapper"
import { useAuth } from "@/components/auth-context"

type AddMemberInput = {
  nickname: string
  characterClass: MemberCharacterClass
  level: number
  position: Member["position"]
  joinDate?: string
  status?: MemberStatus
  role?: MemberProgramRole
}

type AdminUpdateMemberInput = Partial<
  Pick<
    Member,
    | "characterClass"
    | "level"
    | "position"
    | "joinDate"
    | "status"
    | "role"
    | "accountStatus"
  >
>

type OwnProfileInput = Pick<Member, "characterClass" | "level">

type MembersContextValue = {
  members: Member[]
  isLoading: boolean
  loadError: string | null
  changeLogs: AdminChangeLog[]
  getMember: (id: string) => Member | undefined
  getActiveMembers: () => Member[]
  getRosterMembers: () => RosterMember[]
  getStats: () => ReturnType<typeof getMemberStats>
  isNicknameTaken: (nickname: string, excludeId?: string) => boolean
  refreshMembers: () => Promise<void>
  ensureFullMembersLoaded: () => Promise<void>
  addMember: (
    input: AddMemberInput,
    actorMemberId?: string,
  ) => Promise<{ ok: boolean; message: string; member?: Member }>
  updateMember: (
    id: string,
    input: AdminUpdateMemberInput,
    memo?: string,
    actorMemberId?: string,
  ) => Promise<{ ok: boolean; message: string }>
  updateOwnProfile: (
    memberId: string,
    input: OwnProfileInput,
  ) => Promise<{ ok: boolean; message: string }>
  resetMemberPassword: (memberId: string) => Promise<{ ok: boolean; message: string }>
  adminCorrectNickname: (
    id: string,
    newNickname: string,
    memo: string,
  ) => { ok: boolean; message: string }
  getChangeLogsForMember: (memberId: string) => AdminChangeLog[]
}

const MembersContext = createContext<MembersContextValue | null>(null)

function appendLog(
  logs: AdminChangeLog[],
  entry: Omit<AdminChangeLog, "id" | "changedAt">,
): AdminChangeLog[] {
  return [
    ...logs,
    {
      ...entry,
      id: `mlog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      changedAt: Date.now(),
    },
  ]
}

function validateCharacterClass(value: string): value is MemberCharacterClass {
  return (MEMBER_CHARACTER_CLASSES as readonly string[]).includes(value)
}

export function MembersProvider({
  children,
  initialRoster,
  skipInitialFetch = false,
}: {
  children: ReactNode
  initialRoster?: RosterMember[]
  skipInitialFetch?: boolean
}) {
  const { isAuthenticated, isHydrated } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [rosterMembers, setRosterMembers] = useState<RosterMember[]>(initialRoster ?? [])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [changeLogs, setChangeLogs] = useState<AdminChangeLog[]>([])
  const fullMembersLoadedRef = useRef(false)

  const supabase = useMemo(() => tryCreateClient(), [])

  const refreshMembers = useCallback(async () => {
    if (!supabase || !isAuthenticated) {
      setMembers([])
      return
    }

    setIsLoading(true)
    setLoadError(null)

    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("nickname")

    setIsLoading(false)

    if (error) {
      setLoadError("혈맹원 목록을 불러오지 못했습니다.")
      return
    }

    setMembers((data as MemberRow[]).map(rowToMember))
    setRosterMembers(
      (data as MemberRow[])
        .filter((m) => m.status === "활동")
        .map((m) => ({ id: m.id, nickname: m.nickname })),
    )
    fullMembersLoadedRef.current = true
  }, [supabase, isAuthenticated])

  const ensureFullMembersLoaded = useCallback(async () => {
    if (fullMembersLoadedRef.current && members.length > 0) return
    await refreshMembers()
  }, [refreshMembers, members.length])

  useEffect(() => {
    if (!isHydrated) return
    if (skipInitialFetch) return
    if (isAuthenticated) {
      void refreshMembers()
    } else {
      setMembers([])
    }
  }, [isHydrated, isAuthenticated, refreshMembers, skipInitialFetch])

  const getMember = useCallback(
    (id: string) => members.find((m) => m.id === id),
    [members],
  )

  const getActiveMembers = useCallback(
    () => members.filter((m) => m.status === "활동"),
    [members],
  )

  const getRosterMembers = useCallback((): RosterMember[] => {
    if (members.length > 0) {
      return getActiveMembers().map((m) => ({ id: m.id, nickname: m.nickname }))
    }
    return rosterMembers
  }, [getActiveMembers, members.length, rosterMembers])

  const getStats = useCallback(() => getMemberStats(members), [members])

  const isNicknameTaken = useCallback(
    (nickname: string, excludeId?: string) =>
      members.some(
        (m) => m.nickname.trim() === nickname.trim() && m.id !== excludeId,
      ),
    [members],
  )

  const addMember = useCallback(
    async (
      input: AddMemberInput,
      actorMemberId?: string,
    ): Promise<{ ok: boolean; message: string; member?: Member }> => {
      const actor = actorMemberId ? members.find((m) => m.id === actorMemberId) : undefined
      const role = input.role ?? "member"
      if (role !== "member" && actor?.role !== "admin") {
        return { ok: false, message: "프로그램 권한은 최고관리자만 설정할 수 있습니다." }
      }

      const nickname = input.nickname.trim()
      if (!nickname) return { ok: false, message: "캐릭터명을 입력해주세요." }
      if (!validateCharacterClass(input.characterClass)) {
        return { ok: false, message: "클래스를 선택해주세요." }
      }
      if (!isValidMemberLevel(input.level)) {
        return { ok: false, message: "레벨은 1~999 사이 정수여야 합니다." }
      }
      if (isNicknameTaken(nickname)) {
        return { ok: false, message: "이미 등록된 혈맹원입니다." }
      }

      const res = await fetch("/api/members/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = (await res.json()) as {
        ok: boolean
        message?: string
        member?: Member
      }

      if (!data.ok) {
        return { ok: false, message: data.message ?? "혈맹원 등록에 실패했습니다." }
      }

      await refreshMembers()
      if (data.member) {
        setChangeLogs((prev) =>
          appendLog(prev, {
            type: "member_update",
            targetId: data.member!.id,
            oldValue: "",
            newValue: "등록",
            memo: "혈맹원 추가",
          }),
        )
      }

      return {
        ok: true,
        message: data.message ?? "혈맹원이 등록되었습니다.",
        member: data.member,
      }
    },
    [isNicknameTaken, members, refreshMembers],
  )

  const updateOwnProfile = useCallback(
    async (memberId: string, input: OwnProfileInput): Promise<{ ok: boolean; message: string }> => {
      if (!supabase) {
        return { ok: false, message: "Supabase 연결이 설정되지 않았습니다." }
      }

      const existing = members.find((m) => m.id === memberId)
      if (!existing) {
        return { ok: false, message: "혈맹원을 찾을 수 없습니다." }
      }

      if (!isValidMemberLevel(input.level)) {
        return { ok: false, message: "레벨은 1~999 사이 정수여야 합니다." }
      }
      if (!validateCharacterClass(input.characterClass)) {
        return { ok: false, message: "올바른 클래스를 선택해주세요." }
      }

      const { error } = await supabase
        .from("members")
        .update({
          class_name: input.characterClass,
          level: input.level,
        })
        .eq("id", memberId)

      if (error) {
        return { ok: false, message: "저장에 실패했습니다." }
      }

      const logs: AdminChangeLog[] = []
      if (existing.characterClass !== input.characterClass) {
        logs.push({
          id: "",
          type: "member_update",
          targetId: memberId,
          oldValue: existing.characterClass,
          newValue: input.characterClass,
          memo: "본인 프로필 수정",
          changedAt: 0,
        })
      }
      if (existing.level !== input.level) {
        logs.push({
          id: "",
          type: "member_update",
          targetId: memberId,
          oldValue: String(existing.level),
          newValue: String(input.level),
          memo: "본인 프로필 수정",
          changedAt: 0,
        })
      }

      await refreshMembers()

      if (logs.length > 0) {
        setChangeLogs((prev) => {
          let next = prev
          for (const log of logs) {
            next = appendLog(next, {
              type: log.type,
              targetId: log.targetId,
              oldValue: log.oldValue,
              newValue: log.newValue,
              memo: log.memo,
            })
          }
          return next
        })
      }

      return { ok: true, message: "저장되었습니다." }
    },
    [members, supabase, refreshMembers],
  )

  const updateMember = useCallback(
    async (
      id: string,
      input: AdminUpdateMemberInput,
      memo = "관리자 수정",
      actorMemberId?: string,
    ): Promise<{ ok: boolean; message: string }> => {
      const existing = members.find((m) => m.id === id)
      if (!existing) return { ok: false, message: "혈맹원을 찾을 수 없습니다." }

      const actor = actorMemberId ? members.find((m) => m.id === actorMemberId) : undefined
      if (input.role !== undefined && actor?.role !== "admin") {
        return { ok: false, message: "프로그램 권한은 최고관리자만 변경할 수 있습니다." }
      }

      const res = await fetch("/api/members/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId: id, ...input }),
      })
      const data = (await res.json()) as { ok: boolean; message?: string }

      if (!data.ok) {
        return { ok: false, message: data.message ?? "저장에 실패했습니다." }
      }

      const allowedFields: (keyof AdminUpdateMemberInput)[] = [
        "characterClass",
        "level",
        "position",
        "joinDate",
        "status",
        "role",
        "accountStatus",
      ]
      const logs: AdminChangeLog[] = []
      for (const field of allowedFields) {
        const newVal = input[field]
        if (newVal === undefined) continue
        const oldVal = existing[field as keyof Member]
        if (String(oldVal) === String(newVal)) continue

        const type =
          field === "status"
            ? "member_status"
            : field === "role"
              ? "member_role"
              : "member_update"

        logs.push({
          id: "",
          type,
          targetId: id,
          oldValue: String(oldVal),
          newValue: String(newVal),
          memo,
          changedAt: 0,
        })
      }

      await refreshMembers()

      if (logs.length > 0) {
        setChangeLogs((prev) => {
          let next = prev
          for (const log of logs) {
            next = appendLog(next, {
              type: log.type,
              targetId: log.targetId,
              oldValue: log.oldValue,
              newValue: log.newValue,
              memo: log.memo,
            })
          }
          return next
        })
      }

      return { ok: true, message: data.message ?? "저장되었습니다." }
    },
    [members, refreshMembers],
  )

  const resetMemberPassword = useCallback(
    async (memberId: string): Promise<{ ok: boolean; message: string }> => {
      const res = await fetch("/api/members/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId }),
      })
      const data = (await res.json()) as { ok: boolean; message?: string }
      return { ok: data.ok, message: data.message ?? "비밀번호 초기화에 실패했습니다." }
    },
    [],
  )

  const adminCorrectNickname = useCallback(
    (id: string, newNickname: string, memo: string): { ok: boolean; message: string } => {
      return { ok: false, message: "캐릭터명 정정은 Supabase 관리 콘솔에서 처리해주세요." }
    },
    [],
  )

  const getChangeLogsForMember = useCallback(
    (memberId: string) => changeLogs.filter((l) => l.targetId === memberId),
    [changeLogs],
  )

  const value = useMemo(
    () => ({
      members,
      isLoading,
      loadError,
      changeLogs,
      getMember,
      getActiveMembers,
      getRosterMembers,
      getStats,
      isNicknameTaken,
      refreshMembers,
      ensureFullMembersLoaded,
      addMember,
      updateMember,
      updateOwnProfile,
      resetMemberPassword,
      adminCorrectNickname,
      getChangeLogsForMember,
    }),
    [
      members,
      isLoading,
      loadError,
      changeLogs,
      getMember,
      getActiveMembers,
      getRosterMembers,
      getStats,
      isNicknameTaken,
      refreshMembers,
      ensureFullMembersLoaded,
      addMember,
      updateMember,
      updateOwnProfile,
      resetMemberPassword,
      adminCorrectNickname,
      getChangeLogsForMember,
    ],
  )

  return <MembersContext.Provider value={value}>{children}</MembersContext.Provider>
}

export function useMembers() {
  const ctx = useContext(MembersContext)
  if (!ctx) throw new Error("useMembers must be used within MembersProvider")
  return ctx
}

/** @deprecated use useMembers().getRosterMembers() */
export function useRosterForCheck(): RosterMember[] {
  return useMembers().getRosterMembers()
}
