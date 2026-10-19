import type { PlanChecklist } from "@oh-my-opencode/boulder-state"

/**
 * [OMC] v2 boulder-continuation counters and progress signature (task 4).
 *
 * Pure state transitions over the per-work continuation counters plus the
 * progress signature defined in SPEC sections 1, 2, 3.1, 3.4 and 6. No global
 * clock: every transition that needs time takes `now` (ms) as a parameter. No
 * timers, no event subscriptions, no boulder writes.
 */

/** Hard cap: `steers_total >= STEER_CAP` stops the work (SPEC 3.1, D6). */
export const STEER_CAP = 30

/** Backoff engages at this many consecutive injection failures (SPEC 3.4, D7). */
export const BACKOFF_FAILURE_THRESHOLD = 10

/** Backoff window in ms; the counter resets once it elapses (SPEC 3.4, D7). */
export const BACKOFF_WINDOW_MS = 300_000

/**
 * Per-work continuation counters (SPEC 1.1). One entry per `work_id`, shared by
 * every parent and child session of that work (D13).
 */
export interface WorkCounterState {
  /** Accumulated admitted steers; the hard-cap counter. Never resets intra-work. */
  steers_total: number
  /** Consecutive steers observed with the same progress signature. */
  consecutive_no_progress: number
  /** Consecutive injection failures; drives the backoff. */
  prompt_failures: number
  /** Timestamp (ms) of the last injection failure, or null. */
  last_failure_at: number | null
  /** Timestamp (ms) of the last admitted steer, or null. */
  last_injected_at: number | null
  /** True when a stop phrase disarmed the work (D11). */
  disarmed: boolean
  /** Last observed progress signature, or null before the first steer. */
  signature: string | null
}

/** All-zero counter state for a freshly started work. */
export function createWorkCounterState(): WorkCounterState {
  return {
    steers_total: 0,
    consecutive_no_progress: 0,
    prompt_failures: 0,
    last_failure_at: null,
    last_injected_at: null,
    disarmed: false,
    signature: null,
  }
}

/**
 * Canonical progress signature `"<work_id>:<completed>/<total>"` (SPEC 2.1).
 * `updated_at` is deliberately excluded: it measures agent activity, not plan
 * progress, so including it would defeat the no-progress stop (SPEC 2.2, D4).
 */
export function progressSignature(work_id: string, checklist: PlanChecklist): string {
  return `${work_id}:${checklist.completed}/${checklist.total}`
}

/**
 * Admitted steer (SPEC 1.2): consumes cap, stamps `last_injected_at` and
 * advances the no-progress counter. `prompt_failures`, `last_failure_at` and
 * `disarmed` are untouched.
 */
export function recordSteer(
  state: WorkCounterState,
  newSignature: string,
  now: number,
): WorkCounterState {
  const sameSignature = state.signature !== null && state.signature === newSignature
  return {
    ...state,
    steers_total: state.steers_total + 1,
    last_injected_at: now,
    signature: newSignature,
    consecutive_no_progress: sameSignature ? state.consecutive_no_progress + 1 : 0,
  }
}

/**
 * Failed injection attempt (SPEC 1.2): advances the failure streak. A failure
 * consumes no cap because no model turn happened.
 */
export function recordFailure(state: WorkCounterState, now: number): WorkCounterState {
  return {
    ...state,
    prompt_failures: state.prompt_failures + 1,
    last_failure_at: now,
  }
}

/**
 * Real plan progress detected (SPEC 1.2): clears the no-progress counter and
 * adopts the new signature. `steers_total` is never reset (absolute cap, D6).
 */
export function resetOnProgress(
  state: WorkCounterState,
  newSignature: string,
): WorkCounterState {
  return {
    ...state,
    consecutive_no_progress: 0,
    signature: newSignature,
  }
}

/** Stop phrase matched (SPEC 1.2, D11): only the flag changes. */
export function disarm(state: WorkCounterState): WorkCounterState {
  return { ...state, disarmed: true }
}

/** Re-arm phrase matched or plan signature changed (SPEC 1.2, D11). */
export function rearm(state: WorkCounterState): WorkCounterState {
  return { ...state, disarmed: false }
}

/**
 * An admitted steer restarts the failure streak (SPEC 1.3 note). The gate calls
 * this on admission so `recordSteer` stays free of the failure responsibility.
 */
export function resetFailuresOnAdmission(state: WorkCounterState): WorkCounterState {
  return { ...state, prompt_failures: 0 }
}

/** Hard cap reached (SPEC 3.1). Absolute per work, never reset intra-work. */
export function shouldStopOnCap(state: WorkCounterState): boolean {
  return state.steers_total >= STEER_CAP
}

/**
 * Backoff active (SPEC 3.4): enough consecutive failures AND the 5 minute
 * window has not elapsed. This predicate is side-effect free; the reset-on-
 * expiry is applied by `applyBackoffExpiry`.
 */
export function shouldStopOnBackoff(state: WorkCounterState, now: number): boolean {
  if (state.prompt_failures < BACKOFF_FAILURE_THRESHOLD) {
    return false
  }
  if (state.last_failure_at === null) {
    return false
  }
  return now - state.last_failure_at < BACKOFF_WINDOW_MS
}

/**
 * Reset-on-expiry (SPEC 3.4, D7): once the 5 minute window has elapsed, the
 * failure counter returns to 0 so the work is retried instead of abandoned.
 * `last_failure_at` is preserved (it is only compared against `now`). No-op
 * while the backoff is still active or never engaged.
 */
export function applyBackoffExpiry(state: WorkCounterState, now: number): WorkCounterState {
  if (state.prompt_failures < BACKOFF_FAILURE_THRESHOLD) {
    return state
  }
  if (state.last_failure_at === null) {
    return state
  }
  if (now - state.last_failure_at < BACKOFF_WINDOW_MS) {
    return state
  }
  return { ...state, prompt_failures: 0 }
}
