type PerfScalar = number | boolean | string | undefined

/** Structured server-side performance log (no PII). Enable with PERF_LOG=1 or ENABLE_PERF_LOG=1. */
export function isPerfLogEnabled(): boolean {
  return process.env.PERF_LOG === "1" || process.env.ENABLE_PERF_LOG === "1"
}

export class PerfTimer {
  private readonly label: string
  private readonly startMs: number
  private readonly fields: Record<string, number> = {}
  private dbCallCount = 0

  constructor(label: string) {
    this.label = label
    this.startMs = performance.now()
  }

  markMs(field: string, ms: number) {
    this.fields[field] = Math.round(ms * 100) / 100
  }

  async measure<T>(field: string, fn: () => Promise<T>): Promise<T> {
    const t0 = performance.now()
    try {
      return await fn()
    } finally {
      this.markMs(field, performance.now() - t0)
    }
  }

  addDbCalls(count = 1) {
    this.dbCallCount += count
  }

  finish(extra?: Record<string, PerfScalar>) {
    if (!isPerfLogEnabled()) return
    const totalMs = Math.round((performance.now() - this.startMs) * 100) / 100
    const payload: Record<string, PerfScalar> = {
      totalMs,
      dbCallCount: this.dbCallCount,
      ...this.fields,
      ...extra,
    }
    console.info(`[PERF ${this.label}]`, JSON.stringify(payload))
  }
}
