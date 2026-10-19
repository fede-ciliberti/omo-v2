/**
 * [OMC] v2 boulder-continuation debounce (task 8).
 *
 * Per-session debounce windows (SPEC.md 3.5): arming schedules a timer that
 * settles the gate's `debounce` promise `true`; cancelling (a user-activity
 * event) aborts it and settles the promise `false`, so the pending steer never
 * fires. The timer surface is injectable so tests use a manual scheduler.
 */

export interface ContinuationTimers {
  setTimeout(handler: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
}

export const defaultTimers: ContinuationTimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

interface PendingDebounce {
  readonly controller: AbortController
  readonly timer: unknown
  readonly promise: Promise<boolean>
}

export interface DebounceManager {
  arm(sessionId: string): void
  wait(sessionId: string): Promise<boolean>
  cancel(sessionId: string): void
  cancelAll(): void
}

export function createDebounceManager(windowMs: number, timers: ContinuationTimers): DebounceManager {
  const pending = new Map<string, PendingDebounce>()

  const cancel = (sessionId: string): void => {
    const entry = pending.get(sessionId)
    if (!entry) return
    pending.delete(sessionId)
    timers.clearTimeout(entry.timer)
    entry.controller.abort()
  }

  return {
    arm(sessionId) {
      cancel(sessionId)
      const controller = new AbortController()
      let settle: (value: boolean) => void = () => undefined
      const promise = new Promise<boolean>((resolve) => {
        settle = resolve
      })
      const timer = timers.setTimeout(() => {
        pending.delete(sessionId)
        settle(true)
      }, windowMs)
      controller.signal.addEventListener("abort", () => settle(false), { once: true })
      pending.set(sessionId, { controller, timer, promise })
    },
    wait(sessionId) {
      const entry = pending.get(sessionId)
      return entry ? entry.promise : Promise.resolve(true)
    },
    cancel,
    cancelAll() {
      for (const sessionId of [...pending.keys()]) cancel(sessionId)
    },
  }
}
