import {
  CONTRIBUTION_GENERAL,
  CONTRIBUTION_MAIN,
  CONTRIBUTION_SIEGE,
} from "@/lib/boss-time-slots"

export type ContributionScoreValues = {
  generalBossScore: number
  mainBossScore: number
  siegeScore: number
}

export type ContributionScoreSetting = ContributionScoreValues & {
  id: string
  effectiveFrom: string
  createdBy: string | null
  createdAt: string
}

export const DEFAULT_CONTRIBUTION_SCORES: ContributionScoreValues = {
  generalBossScore: CONTRIBUTION_GENERAL,
  mainBossScore: CONTRIBUTION_MAIN,
  siegeScore: CONTRIBUTION_SIEGE,
}

export function mapContributionScoreRow(row: {
  id: string
  general_boss_score: number | string
  main_boss_score: number | string
  siege_score: number | string
  effective_from: string
  created_by: string | null
  created_at: string
}): ContributionScoreSetting {
  return {
    id: row.id,
    generalBossScore: Number(row.general_boss_score),
    mainBossScore: Number(row.main_boss_score),
    siegeScore: Number(row.siege_score),
    effectiveFrom: row.effective_from,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

/** eventDate(YYYY-MM-DD) 기준 적용 점수 — effective_from <= eventDate 중 가장 최근 설정 */
export function resolveContributionScoresForDate(
  settings: ContributionScoreSetting[],
  eventDate: string,
): ContributionScoreValues {
  if (settings.length === 0) return DEFAULT_CONTRIBUTION_SCORES

  let best: ContributionScoreSetting | null = null
  for (const setting of settings) {
    if (setting.effectiveFrom > eventDate) continue
    if (!best || setting.effectiveFrom > best.effectiveFrom) {
      best = setting
    }
  }

  return best ?? DEFAULT_CONTRIBUTION_SCORES
}

export function isValidContributionScore(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100
}

export function isValidEffectiveFrom(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}
