import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireAuthenticatedMember } from "@/lib/supabase/auth-helpers"
import { requireManagerOrAdmin, requireAdmin } from "@/lib/supabase/operation-auth"
import { requireMemberInActorGuild, requireMembersInActorGuild } from "@/lib/supabase/guild-scope-helpers"
import { errorToMessage } from "@/lib/supabase/db-errors"
import {
  createBossSettlementOnServer,
  createSiegeSettlementOnServer,
  derivePersonalStatusAfterPayment,
  getSettlementByKey,
  loadAndUpdateManagementPayment,
  loadAndUpdateSettlement,
  onAdditionalAdminPaid,
  onAdditionalAdminPaymentConfirmationCancelled,
  onAdminPaymentConfirmed,
  onAdminPaymentConfirmationCancelled,
  onAdminReturnConfirmed,
  onAdminReturnConfirmationCancelled,
  onMemberReceiptConfirmed,
  onMemberReturnConfirmed,
  reviseSettlementOnServer,
} from "@/lib/supabase/settlement-mutate-helpers"
import type { SettlementModificationLog, SettlementSourceType } from "@/lib/settlement-types"
import type { AttendeeInput } from "@/lib/settlement-revision-utils"
import { getMemberReceiptPendingState } from "@/lib/settlement-revision-utils"
import {
  onManagementAdminPaid,
  onManagementAdminPaidCancelled,
  onManagementMemberConfirmed,
} from "@/lib/settlement-management-payment-utils"

type Body = {
  action?: string
  sourceType?: SettlementSourceType
  sourceId?: string
  slotId?: string
  siegeId?: string
  totalRevenue?: number
  guildShareInput?: number
  managementFeeManualInput?: number
  memo?: string
  memberId?: string
  attendees?: AttendeeInput[]
  reason?: string
  field?: "adminPaid" | "memberReceived"
  value?: boolean
}

function appendModificationLog(
  logs: SettlementModificationLog[],
  entry: Omit<SettlementModificationLog, "id" | "at">,
): SettlementModificationLog[] {
  return [
    ...logs,
    {
      ...entry,
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
    },
  ]
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

    const body = (await request.json()) as Body
    if (!body.action) {
      return NextResponse.json({ ok: false, message: "action이 필요합니다." }, { status: 400 })
    }

    const admin = createAdminClient()
    const actor = authResult.member
    const actorId = actor.id
    const guildId = actor.guild_id

    const adminOnlyActions = new Set([
      "confirm_management_admin_payment",
      "cancel_management_admin_payment",
      "update_management_payment_memo",
    ])

    if (adminOnlyActions.has(body.action)) {
      const adminCheck = requireAdmin(actor)
      if (!adminCheck.ok) {
        return NextResponse.json({ ok: false, message: adminCheck.message }, { status: adminCheck.status })
      }
    }

    const managerActions = new Set([
      "create_boss",
      "create_siege",
      "revise",
      "confirm_admin_payment",
      "confirm_all_admin_payments",
      "confirm_admin_return",
      "confirm_additional_admin_payment",
      "cancel_admin_return_confirmation",
      "cancel_admin_payment_confirmation",
      "cancel_additional_admin_payment_confirmation",
      "admin_modify_status",
    ])

    if (managerActions.has(body.action)) {
      const roleCheck = requireManagerOrAdmin(actor)
      if (!roleCheck.ok) {
        return NextResponse.json({ ok: false, message: roleCheck.message }, { status: roleCheck.status })
      }
    }

    switch (body.action) {
      case "create_boss": {
        const result = await createBossSettlementOnServer(
          admin,
          actorId,
          guildId,
          body.slotId ?? body.sourceId ?? "",
          body.totalRevenue ?? 0,
          body.guildShareInput ?? 0,
          body.managementFeeManualInput ?? 0,
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "create_siege": {
        const result = await createSiegeSettlementOnServer(
          admin,
          actorId,
          guildId,
          body.siegeId ?? body.sourceId ?? "",
          body.totalRevenue ?? 0,
          body.guildShareInput ?? 0,
          body.memo,
          body.managementFeeManualInput ?? 0,
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "revise": {
        if (body.sourceType === "siege" && (body.attendees?.length ?? 0) > 0) {
          const attendeeIds = body.attendees!.map((a) => a.memberId)
          const attendeeScope = await requireMembersInActorGuild(admin, guildId, attendeeIds)
          if (!attendeeScope.ok) {
            return NextResponse.json(
              { ok: false, message: attendeeScope.message },
              { status: attendeeScope.status },
            )
          }
        }

        const result = await reviseSettlementOnServer(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          body.attendees ?? [],
          body.reason ?? "",
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "confirm_admin_payment": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.memberId === body.memberId &&
              !p.adminPaid &&
              (p.adjustmentType === "none" || p.adjustmentType === "new_payout")
                ? onAdminPaymentConfirmed(p)
                : p,
            ),
          }),
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "confirm_all_admin_payments": {
        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => ({
            ...prev,
            participants: prev.participants.map((p) => {
              if (p.adjustmentType === "return") return p
              if (p.adjustmentType === "additional") {
                let next = p
                if (!p.adminPaid) {
                  next = onAdminPaymentConfirmed(next)
                }
                if (!next.additionalAdminPaid) {
                  next = onAdditionalAdminPaid(next)
                }
                return next
              }
              if (p.adjustmentType === "new_payout" || p.adjustmentType === "none") {
                if (p.adminPaid) return p
                return onAdminPaymentConfirmed(p)
              }
              return p
            }),
          }),
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "confirm_additional_admin_payment": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.memberId === body.memberId &&
              p.adjustmentType === "additional" &&
              !p.additionalAdminPaid
                ? onAdditionalAdminPaid(p)
                : p,
            ),
          }),
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "confirm_member_receipt": {
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산 정보가 없습니다." }, { status: 404 })
        }
        const participant = settlement.participants.find((p) => p.memberId === actorId)
        if (!participant) {
          return NextResponse.json({ ok: false, message: "분배 대상이 아닙니다." }, { status: 400 })
        }

        const pending = getMemberReceiptPendingState(participant)
        if (!pending?.actionable) {
          return NextResponse.json(
            { ok: false, message: "수령 확인할 항목이 없습니다." },
            { status: 400 },
          )
        }

        let message = "수령 확인이 완료되었습니다."
        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => ({
            ...prev,
            participants: prev.participants.map((p) => {
              if (p.memberId !== actorId) return p
              if (pending.kind === "additional_only") {
                message = "추가 분배금 수령 확인이 완료되었습니다."
              } else if (pending.kind === "total") {
                message = `총 ${pending.confirmAmount.toLocaleString("ko-KR")}원 수령 확인이 완료되었습니다.`
              }
              return onMemberReceiptConfirmed(p)
            }),
          }),
        )

        return NextResponse.json({ ...result, message }, { status: result.ok ? 200 : 400 })
      }

      case "confirm_member_return": {
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산 정보가 없습니다." }, { status: 404 })
        }
        const participant = settlement.participants.find((p) => p.memberId === actorId)
        if (!participant || participant.adjustmentType !== "return") {
          return NextResponse.json({ ok: false, message: "반환 대상이 아닙니다." }, { status: 400 })
        }

        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.memberId === actorId ? onMemberReturnConfirmed(p) : p,
            ),
          }),
        )

        return NextResponse.json(
          { ...result, message: result.ok ? "반환 확인이 등록되었습니다." : result.message },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "confirm_admin_return": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산 정보가 없습니다." }, { status: 404 })
        }

        const target = settlement.participants.find((p) => p.memberId === body.memberId)
        if (!target || target.adjustmentType !== "return") {
          return NextResponse.json({ ok: false, message: "반환 대상이 아닙니다." }, { status: 400 })
        }

        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => ({
            ...prev,
            participants: prev.participants.map((p) =>
              p.memberId === body.memberId && p.adjustmentType === "return"
                ? onAdminReturnConfirmed(p)
                : p,
            ),
          }),
        )

        return NextResponse.json(
          { ...result, message: result.ok ? "반환 확인이 완료되었습니다." : result.message },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "cancel_admin_return_confirmation": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
        }

        const target = settlement.participants.find((p) => p.memberId === body.memberId)
        if (!target || target.adjustmentType !== "return") {
          return NextResponse.json({ ok: false, message: "반환 대상이 아닙니다." }, { status: 400 })
        }
        if (!target.adminReturnConfirmed) {
          return NextResponse.json(
            { ok: false, message: "취소할 관리자 반환 확인이 없습니다." },
            { status: 400 },
          )
        }

        const logReason = "admin_return_confirmation_cancelled"

        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => {
            const p = prev.participants.find((x) => x.memberId === body.memberId)
            if (!p) return prev
            return {
              ...prev,
              participants: prev.participants.map((x) =>
                x.memberId === body.memberId && x.adjustmentType === "return"
                  ? onAdminReturnConfirmationCancelled(x)
                  : x,
              ),
              modificationLogs: appendModificationLog(prev.modificationLogs, {
                targetMemberId: body.memberId!,
                targetName: p.name,
                field: "return",
                beforeValue: true,
                afterValue: false,
                reason: logReason,
              }),
            }
          },
          {
            newModificationLog: {
              id: "",
              at: Date.now(),
              targetMemberId: body.memberId!,
              targetName: target.name,
              field: "return",
              beforeValue: true,
              afterValue: false,
              reason: logReason,
            },
          },
        )

        return NextResponse.json(
          {
            ...result,
            message: result.ok ? "반환 수령 확인이 취소되었습니다." : result.message,
          },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "cancel_admin_payment_confirmation": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
        }

        const target = settlement.participants.find((p) => p.memberId === body.memberId)
        if (!target) {
          return NextResponse.json({ ok: false, message: "정산 대상이 아닙니다." }, { status: 400 })
        }
        if (target.adjustmentType === "return" || target.adjustmentType === "additional") {
          return NextResponse.json(
            { ok: false, message: "반환/추가 지급 대상에는 지급 확인 취소를 사용할 수 없습니다." },
            { status: 400 },
          )
        }
        if (!target.adminPaid) {
          return NextResponse.json(
            { ok: false, message: "취소할 관리자 지급 확인이 없습니다." },
            { status: 400 },
          )
        }

        const logReason = "admin_payment_confirmation_cancelled"

        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => {
            const p = prev.participants.find((x) => x.memberId === body.memberId)
            if (!p) return prev
            return {
              ...prev,
              participants: prev.participants.map((x) =>
                x.memberId === body.memberId ? onAdminPaymentConfirmationCancelled(x) : x,
              ),
              modificationLogs: appendModificationLog(prev.modificationLogs, {
                targetMemberId: body.memberId!,
                targetName: p.name,
                field: "adminPaid",
                beforeValue: true,
                afterValue: false,
                reason: logReason,
              }),
            }
          },
          {
            newModificationLog: {
              id: "",
              at: Date.now(),
              targetMemberId: body.memberId!,
              targetName: target.name,
              field: "adminPaid",
              beforeValue: true,
              afterValue: false,
              reason: logReason,
            },
          },
        )

        return NextResponse.json(
          {
            ...result,
            message: result.ok ? "지급 완료 확인이 취소되었습니다." : result.message,
          },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "cancel_additional_admin_payment_confirmation": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
        }

        const target = settlement.participants.find((p) => p.memberId === body.memberId)
        if (!target || target.adjustmentType !== "additional") {
          return NextResponse.json({ ok: false, message: "추가 지급 대상이 아닙니다." }, { status: 400 })
        }
        if (!target.additionalAdminPaid) {
          return NextResponse.json(
            { ok: false, message: "취소할 추가 지급 확인이 없습니다." },
            { status: 400 },
          )
        }

        const logReason = "admin_additional_payment_confirmation_cancelled"

        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => {
            const p = prev.participants.find((x) => x.memberId === body.memberId)
            if (!p) return prev
            return {
              ...prev,
              participants: prev.participants.map((x) =>
                x.memberId === body.memberId && x.adjustmentType === "additional"
                  ? onAdditionalAdminPaymentConfirmationCancelled(x)
                  : x,
              ),
              modificationLogs: appendModificationLog(prev.modificationLogs, {
                targetMemberId: body.memberId!,
                targetName: p.name,
                field: "additional",
                beforeValue: true,
                afterValue: false,
                reason: logReason,
              }),
            }
          },
          {
            newModificationLog: {
              id: "",
              at: Date.now(),
              targetMemberId: body.memberId!,
              targetName: target.name,
              field: "additional",
              beforeValue: true,
              afterValue: false,
              reason: logReason,
            },
          },
        )

        return NextResponse.json(
          {
            ...result,
            message: result.ok ? "추가 지급 확인이 취소되었습니다." : result.message,
          },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "admin_modify_status": {
        if (!body.reason?.trim()) {
          return NextResponse.json({ ok: false, message: "사유를 입력해주세요." }, { status: 400 })
        }
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const result = await loadAndUpdateSettlement(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          (prev) => {
            const target = prev.participants.find((p) => p.memberId === body.memberId)
            if (!target) return prev
            const field = body.field!
            const value = !!body.value
            const beforeValue = field === "adminPaid" ? target.adminPaid : target.memberReceived
            if (beforeValue === value) return prev

            return {
              ...prev,
              participants: prev.participants.map((p) => {
                if (p.memberId !== body.memberId) return p
                if (field === "adminPaid") {
                  const next = {
                    ...p,
                    adminPaid: value,
                    adminPaidAt: value ? Date.now() : null,
                    paidAmount: value ? p.payoutAmount : 0,
                  }
                  next.personalStatus = derivePersonalStatusAfterPayment(next)
                  return next
                }
                const next = {
                  ...p,
                  memberReceived: value,
                  memberReceivedAt: value ? Date.now() : null,
                }
                next.personalStatus = derivePersonalStatusAfterPayment(next)
                return next
              }),
              modificationLogs: [
                ...prev.modificationLogs,
                {
                  id: `temp-${Date.now()}`,
                  at: Date.now(),
                  targetMemberId: body.memberId!,
                  targetName: target.name,
                  field,
                  beforeValue,
                  afterValue: value,
                  reason: body.reason!.trim(),
                },
              ],
            }
          },
          {
            newModificationLog: {
              id: "",
              at: Date.now(),
              targetMemberId: body.memberId!,
              targetName: "",
              field: body.field!,
              beforeValue: false,
              afterValue: !!body.value,
              reason: body.reason!.trim(),
            },
          },
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      case "confirm_management_admin_payment": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const result = await loadAndUpdateManagementPayment(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          body.memberId!,
          (payment) => {
            if (payment.adminPaid) return null
            return onManagementAdminPaid(payment, actorId)
          },
          { action: "admin_paid", reason: "management_admin_payment_confirmed" },
        )
        return NextResponse.json(
          { ...result, message: result.ok ? "관리비 지급 완료 처리되었습니다." : result.message },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "cancel_management_admin_payment": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산이 없습니다." }, { status: 404 })
        }
        const target = settlement.managementPayments?.find((p) => p.memberId === body.memberId)
        if (!target) {
          return NextResponse.json({ ok: false, message: "관리비 지급 대상이 아닙니다." }, { status: 400 })
        }
        if (!target.adminPaid) {
          return NextResponse.json(
            { ok: false, message: "취소할 관리비 지급 확인이 없습니다." },
            { status: 400 },
          )
        }
        if (target.memberConfirmed) {
          return NextResponse.json(
            { ok: false, message: "수령 확인된 관리비는 지급 취소할 수 없습니다." },
            { status: 400 },
          )
        }

        const result = await loadAndUpdateManagementPayment(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          body.memberId!,
          (payment) => onManagementAdminPaidCancelled(payment),
          { action: "admin_paid_cancelled", reason: body.reason?.trim() || "management_admin_payment_cancelled" },
        )
        return NextResponse.json(
          { ...result, message: result.ok ? "관리비 지급 완료 확인이 취소되었습니다." : result.message },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "confirm_management_member_receipt": {
        const settlement = await getSettlementByKey(admin, guildId, body.sourceType!, body.sourceId!)
        if (!settlement) {
          return NextResponse.json({ ok: false, message: "정산 정보가 없습니다." }, { status: 404 })
        }
        const payment = settlement.managementPayments?.find((p) => p.memberId === actorId)
        if (!payment) {
          return NextResponse.json({ ok: false, message: "관리비 수령 대상이 아닙니다." }, { status: 400 })
        }
        if (!payment.adminPaid) {
          return NextResponse.json(
            { ok: false, message: "관리자 지급 완료 후 수령 확인할 수 있습니다." },
            { status: 400 },
          )
        }
        if (payment.memberConfirmed) {
          return NextResponse.json({ ok: false, message: "이미 수령 확인되었습니다." }, { status: 400 })
        }

        const result = await loadAndUpdateManagementPayment(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          actorId,
          (p) => onManagementMemberConfirmed(p),
          { action: "member_confirmed", reason: "management_member_receipt_confirmed" },
        )
        return NextResponse.json(
          {
            ...result,
            message: result.ok
              ? `${payment.amount.toLocaleString("ko-KR")}원 관리비 수령 확인이 완료되었습니다.`
              : result.message,
          },
          { status: result.ok ? 200 : 400 },
        )
      }

      case "update_management_payment_memo": {
        if (body.memberId) {
          const mc = await requireMemberInActorGuild(admin, guildId, body.memberId)
          if (!mc.ok) {
            return NextResponse.json({ ok: false, message: mc.message }, { status: mc.status })
          }
        }
        const memo = body.memo?.trim() ?? ""
        const result = await loadAndUpdateManagementPayment(
          admin,
          actorId,
          guildId,
          body.sourceType!,
          body.sourceId!,
          body.memberId!,
          (payment) => ({ ...payment, memo: memo || null }),
          { action: "memo_updated", reason: body.reason?.trim() || "management_payment_memo_updated" },
        )
        return NextResponse.json(result, { status: result.ok ? 200 : 400 })
      }

      default:
        return NextResponse.json({ ok: false, message: "알 수 없는 action입니다." }, { status: 400 })
    }
  } catch (error) {
    console.error("[settlements/mutate]", error)
    return NextResponse.json(
      { ok: false, message: errorToMessage(error, "정산 처리 중 오류가 발생했습니다.") },
      { status: 500 },
    )
  }
}
