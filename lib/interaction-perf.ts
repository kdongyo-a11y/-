/** Client-side click → feedback timing. Enable with NEXT_PUBLIC_INTERACTION_PERF=1. */
export type InteractionSample = {
  label: string
  clickToPendingMs: number
  clickToFinalMs: number
  serverTotalMs?: number
  ok?: boolean
  error?: boolean
}

export function isInteractionPerfEnabled(): boolean {
  if (typeof window === "undefined") return false
  return (
    process.env.NEXT_PUBLIC_INTERACTION_PERF === "1" ||
    (typeof localStorage !== "undefined" && localStorage.getItem("INTERACTION_PERF") === "1")
  )
}

export type InteractionTracker = {
  markPending: () => void
  finish: (extra?: { serverTotalMs?: number; ok?: boolean; error?: boolean }) => void
}

export function trackInteraction(label: string): InteractionTracker {
  const clickMs = performance.now()
  let pendingMs: number | null = null

  return {
    markPending() {
      if (pendingMs == null) pendingMs = performance.now() - clickMs
    },
    finish(extra) {
      const clickToFinalMs = Math.round((performance.now() - clickMs) * 100) / 100
      const clickToPendingMs =
        pendingMs != null ? Math.round(pendingMs * 100) / 100 : clickToFinalMs

      if (isInteractionPerfEnabled()) {
        const sample: InteractionSample = {
          label,
          clickToPendingMs,
          clickToFinalMs,
          ...extra,
        }
        console.info(`[INTERACTION ${label}]`, JSON.stringify(sample))
      }
    },
  }
}

/** Wrap async mutation: mark pending synchronously, then run fn. */
export async function runTrackedInteraction<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: {
    onPending?: () => void
    serverTotalMs?: (result: T) => number | undefined
    isOk?: (result: T) => boolean
  },
): Promise<T> {
  const tracker = trackInteraction(label)
  tracker.markPending()
  opts?.onPending?.()
  try {
    const result = await fn()
    tracker.finish({
      serverTotalMs: opts?.serverTotalMs?.(result),
      ok: opts?.isOk ? opts.isOk(result) : true,
    })
    return result
  } catch {
    tracker.finish({ error: true })
    throw new Error(`${label} failed`)
  }
}
