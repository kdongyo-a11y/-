"use client"

import { useMemo, useState } from "react"
import { SectionTitle, StatCard, Badge, Card } from "@/components/ui-bits"
import { useParticipation, formatCheckTime } from "@/components/participation-context"
import { useSiege } from "@/components/siege-context"
import { useSettlement, isSettlementComplete } from "@/components/settlement-context"
import { useCurrentMemberId } from "@/components/auth-context"
import { formatWon } from "@/lib/guild-data"
import { Swords, Wallet, Percent, CheckCircle2, Shield } from "lucide-react"
import { formatContributionPoints } from "@/lib/boss-time-slots"
import { formatSiegeTimeRange, SIEGE_CONTRIBUTION_POINTS } from "@/lib/siege-utils"
import type { SettlementSourceType } from "@/lib/settlement-types"

export function RecordsScreen() {
  const { getMemberSessionRecords, getSlot } = useParticipation()
  const { getMemberSiegeSessionRecords } = useSiege()
  const { getMemberSettlements, getMemberReceivedPayoutTotal, confirmMemberReceipt, getMemberPayout } = useSettlement()
  const [receiptFeedback, setReceiptFeedback] = useState<string | null>(null)

  const memberId = useCurrentMemberId()
  const sessionRecords = getMemberSessionRecords(memberId)
  const siegeRecords = getMemberSiegeSessionRecords(memberId, (siegeId, mid) => {
    const p = getMemberPayout("siege", siegeId, memberId)
    if (!p) return null
    return {
      amount: p.payoutAmount,
      complete: isSettlementComplete(p.adminPaid, p.memberReceived),
    }
  })
  const mySettlements = getMemberSettlements(memberId)
  const totalPayout = getMemberReceivedPayoutTotal(memberId)

  const allRecords = useMemo(() => {
    return sessionRecords.map((r) => ({
      id: r.id,
      date: r.date,
      time: r.time,
      title: `${r.time} ${r.label}`,
      sub: [
        r.checkedAt ? `체크시간 ${formatCheckTime(r.checkedAt)}` : "참여체크 미완료",
        r.contributionPoints != null
          ? `기여 ${formatContributionPoints(r.contributionPoints)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      result: r.result,
    }))
  }, [sessionRecords])

  const attended = allRecords.filter((r) => r.result === "참여").length
  const rate = allRecords.length > 0 ? Math.round((attended / allRecords.length) * 100) : 0
  const sessionAttended = sessionRecords.filter((r) => r.result === "참여").length

  async function handleReceipt(sourceType: SettlementSourceType, sourceId: string) {
    const result = await confirmMemberReceipt(sourceType, sourceId)
    setReceiptFeedback(result.message)
  }

  return (
    <div>
      <SectionTitle>내 기록</SectionTitle>

      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="참여"
          value={`${attended}회`}
          sub={sessionAttended > 0 ? `오늘 +${sessionAttended}` : undefined}
          tone="primary"
          icon={<Swords className="h-3.5 w-3.5" />}
        />
        <StatCard label="참여율" value={`${rate}%`} tone="success" icon={<Percent className="h-3.5 w-3.5" />} />
        <StatCard
          label="누적 분배"
          value={Math.round(totalPayout / 10000) + "만"}
          tone="warning"
          icon={<Wallet className="h-3.5 w-3.5" />}
        />
      </div>

      {mySettlements.length > 0 && (
        <>
          <SectionTitle>분배금 정산</SectionTitle>
          <div className="mb-2 flex flex-col gap-2.5">
            {mySettlements.map(({ sourceType, sourceId, settlement, participant }) => {
              const complete = isSettlementComplete(participant.adminPaid, participant.memberReceived)
              const title =
                sourceType === "boss"
                  ? (() => {
                      const slot = getSlot(sourceId)
                      return slot ? `${slot.time} ${slot.label}` : settlement.displayTitle
                    })()
                  : settlement.displayTitle
              const sub = settlement.displaySub

              return (
                <Card key={`${sourceType}-${sourceId}`} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
                      <p className="mt-0.5 font-mono text-base font-semibold text-primary">
                        {formatWon(participant.payoutAmount)}
                      </p>
                      <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
                        <span className={participant.adminPaid ? "text-success" : ""}>
                          지급 {participant.adminPaid ? "완료" : "대기"}
                        </span>
                        <span aria-hidden>·</span>
                        <span className={participant.memberReceived ? "text-success" : ""}>
                          수령 {participant.memberReceived ? "완료" : "대기"}
                        </span>
                      </div>
                    </div>
                    {complete ? (
                      <Badge tone="success">
                        <CheckCircle2 className="mr-1 inline h-3 w-3" />
                        정산 완료
                      </Badge>
                    ) : participant.adminPaid && !participant.memberReceived ? (
                      <button
                        type="button"
                        onClick={() => handleReceipt(sourceType, sourceId)}
                        className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
                      >
                        수령 확인
                      </button>
                    ) : (
                      <Badge tone="neutral">지급 대기</Badge>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
          {receiptFeedback && (
            <p className="mb-2 text-center text-xs text-muted-foreground">{receiptFeedback}</p>
          )}
        </>
      )}

      {siegeRecords.length > 0 && (
        <>
          <SectionTitle>공성 참여</SectionTitle>
          <div className="mb-2 flex flex-col gap-2.5">
            {siegeRecords.map((r) => (
              <Card key={r.id} className="py-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Shield className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{r.eventDate} 공성</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSiegeTimeRange(r.startTime, r.endTime)} · 사전조사 {r.surveyStatus}
                    </p>
                    {r.actuallyAttended && r.confirmedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        참여 확정 {formatCheckTime(r.confirmedAt)}
                      </p>
                    )}
                    {r.contributionPoints != null && (
                      <p className="mt-1 text-xs font-medium text-primary">
                        기여도 +{formatContributionPoints(SIEGE_CONTRIBUTION_POINTS)}
                      </p>
                    )}
                    {r.payoutAmount != null && (
                      <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                        내 분배금 {formatWon(r.payoutAmount)}
                      </p>
                    )}
                    {r.settlementComplete != null && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        정산 상태 {r.settlementComplete ? "완료" : "진행 중"}
                      </p>
                    )}
                  </div>
                  <Badge tone={r.actuallyAttended ? "success" : "neutral"}>
                    {r.actuallyAttended ? "참여 완료" : r.surveyStatus}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {sessionRecords.length > 0 && (
        <>
          <SectionTitle>오늘 참여체크</SectionTitle>
          <div className="mb-2 flex flex-col gap-2.5">
            {sessionRecords.map((r) => (
              <RecordRow
                key={r.id}
                date={r.date}
                time={r.time}
                title={`${r.time} ${r.label}`}
                sub={[
                  r.checkedAt ? `체크시간 ${formatCheckTime(r.checkedAt)}` : "참여체크 미완료",
                  r.contributionPoints != null
                    ? `기여 ${formatContributionPoints(r.contributionPoints)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                result={r.result}
                highlight
              />
            ))}
          </div>
        </>
      )}

      <SectionTitle>참여 이력</SectionTitle>
      <div className="flex flex-col gap-2.5">
        {allRecords.length === 0 && (
          <Card className="py-6 text-center text-xs text-muted-foreground">
            참여 기록이 없습니다.
          </Card>
        )}
        {allRecords.map((r) => (
          <RecordRow
            key={r.id}
            date={r.date}
            time={r.time}
            title={r.title}
            sub={r.sub}
            result={r.result}
          />
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        누적 분배금 총액 · {formatWon(totalPayout)}
      </p>
    </div>
  )
}

function RecordRow({
  date,
  time,
  title,
  sub,
  result,
  highlight,
}: {
  date: string
  time: string
  title: string
  sub: string
  result: "참여" | "미참여" | "결석"
  highlight?: boolean
}) {
  return (
    <Card className={`flex items-center gap-3 py-3 ${highlight ? "border-primary/25" : ""}`}>
      <div className="flex flex-col items-center rounded-lg bg-secondary px-2.5 py-1.5 text-center">
        <span className="text-[10px] text-muted-foreground">{date.slice(5).replace("-", "/")}</span>
        <span className="font-mono text-xs font-semibold text-foreground">{time}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </div>
      <Badge tone={result === "참여" ? "success" : result === "결석" ? "danger" : "neutral"}>
        {result}
      </Badge>
    </Card>
  )
}
