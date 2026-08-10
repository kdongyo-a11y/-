/** KST(Asia/Seoul) ↔ TIMESTAMPTZ 변환 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** YYYY-MM-DD + HH:mm (KST) → ISO TIMESTAMPTZ */
export function kstLocalDateTimeToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) {
    throw new Error("Invalid KST date/time")
  }
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0) - KST_OFFSET_MS
  return new Date(utcMs).toISOString()
}

/** ISO TIMESTAMPTZ → KST date/time parts for UI */
export function isoToKstParts(iso: string): { date: string; time: string } {
  const utc = new Date(iso)
  const kst = new Date(utc.getTime() + KST_OFFSET_MS)
  const date = [
    kst.getUTCFullYear(),
    String(kst.getUTCMonth() + 1).padStart(2, "0"),
    String(kst.getUTCDate()).padStart(2, "0"),
  ].join("-")
  const time = [
    String(kst.getUTCHours()).padStart(2, "0"),
    String(kst.getUTCMinutes()).padStart(2, "0"),
  ].join(":")
  return { date, time }
}

/** 지금 시각을 effective_from으로 사용 (서버 기준) */
export function effectiveFromNowIso(): string {
  return new Date().toISOString()
}

/** 신규 정책: effective_from >= now (과거 소급 금지) */
export function isEffectiveFromAllowedForNewPolicy(
  effectiveFromIso: string,
  now = new Date(),
): boolean {
  return new Date(effectiveFromIso).getTime() >= now.getTime()
}

export function formatKstDateTimeLabel(iso: string): string {
  const { date, time } = isoToKstParts(iso)
  return `${date} ${time} (KST)`
}
