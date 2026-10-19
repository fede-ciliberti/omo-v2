/**
 * [OMC] v2 boulder-continuation guards (task 6).
 *
 * Pure guard primitives for the continuation gate, per SPEC.md sections 3.2,
 * 3.3, 3.5, 3.7 and 7. Every function is pure: `now` (ms) is passed in, there
 * are no timers and no event subscriptions (those belong to the gate, T8).
 */

/** SPEC 7.1 stop-phrase detector, anchored whole-message. */
export const STOP_PHRASE_PATTERN = /^(stop|no sigas|par[áa]|pare|detenete|detente|alto|basta)[\s!¡.,;:]*$/imu

/** SPEC 7.2 re-arm-phrase detector, anchored whole-message. */
export const REARM_PHRASE_PATTERN = /^(continua|continuá|seguí|reanuda|reanudá|resume)[\s!¡.,;:]*$/imu

/**
 * SPEC 3.5: the EXACT set of V2 events whose arrival cancels a pending steer.
 * Names are taken from `V2_EVENT_NAMES` in `../client-events.ts`.
 */
export const DEBOUNCE_CANCEL_EVENTS = [
  "session.inbox.delivered",
  "session.inbox.enqueued",
  "session.execution.started",
  "tui.prompt.append",
] as const

export type DebounceCancelEvent = (typeof DEBOUNCE_CANCEL_EVENTS)[number]

/** SPEC 3.5: the debounce window is a band; 5s is the SLA worst case. */
export const DEBOUNCE_WINDOW_MIN_MS = 3000
export const DEBOUNCE_WINDOW_MAX_MS = 5000

const DEBOUNCE_CANCEL_EVENT_SET: ReadonlySet<string> = new Set(DEBOUNCE_CANCEL_EVENTS)

/** Pure state of an armed debounce window. */
export interface DebounceState {
  readonly armed_at: number
  readonly due_at: number
}

/**
 * SPEC 3.3: stop for the work once `consecutive_no_progress >= 2`.
 * The gate consults this BEFORE injecting, with `n` already updated by the
 * last `recordSteer`.
 */
export function shouldStopOnNoProgress(consecutive_no_progress: number): boolean {
  return consecutive_no_progress >= 2
}

/**
 * SPEC 3.2: the 5s anti-burst cooldown. Active when a steer was injected
 * strictly less than 5000ms before `now`.
 */
export function cooldownActive(last_injected_at: number | null, now: number): boolean {
  return last_injected_at !== null && now - last_injected_at < 5000
}

/** Arm a debounce window that fires at `now + windowMs`. */
export function armDebounce(now: number, windowMs: number): DebounceState {
  return { armed_at: now, due_at: now + windowMs }
}

/** Absolute time at which the armed debounce is due to fire. */
export function debounceDueAt(state: DebounceState): number {
  return state.due_at
}

/** True when `now` has reached the debounce due time. */
export function debounceIsDue(state: DebounceState, now: number): boolean {
  return now >= state.due_at
}

/** SPEC 3.5: does this event name cancel a pending steer? */
export function isDebounceCancelledBy(eventName: string): boolean {
  return DEBOUNCE_CANCEL_EVENT_SET.has(eventName)
}

/**
 * SPEC 7.1: true when the FIRST user message is exactly a stop phrase
 * (plus trailing punctuation/whitespace). Sentences merely starting with a
 * stop word do not match because of the `$` anchor.
 */
export function matchesStopPhrase(firstUserMessage: string): boolean {
  return STOP_PHRASE_PATTERN.test(firstUserMessage)
}

/** SPEC 7.2: true when the FIRST user message is exactly a re-arm phrase. */
export function matchesRearmPhrase(firstUserMessage: string): boolean {
  return REARM_PHRASE_PATTERN.test(firstUserMessage)
}
