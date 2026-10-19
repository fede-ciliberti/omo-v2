/**
 * [OMC] v2 boulder-continuation gate ordering (task 8).
 *
 * Pins the TOTAL order of the continuation gate (SPEC.md section 3.7) and the
 * vocabulary of skip reasons. Kept apart from `gate.ts` so the ordered decision
 * and its reviewable reasons live in one place.
 */

/** Why the gate skipped a turn end. `injected` and `completed` are terminals. */
export type ContinuationSkipReason =
  | "debounce-cancelled"
  | "absent-state"
  | "corrupt-state"
  | "lookup-miss"
  | "not-continuable"
  | "unknown-status"
  | "disarmed"
  | "blocked-marker"
  | "context-pressure"
  | "no-progress"
  | "cooldown"
  | "cap"
  | "backoff"
  | "injection-failed"

/**
 * Skips that are silent by contract (LOOKUP.md 5.2, section 4.1): an absent
 * boulder file, a session in no work, and a terminal `completed`/`abandoned`
 * work log nothing.
 */
export const SILENT_SKIP_REASONS: ReadonlySet<ContinuationSkipReason> = new Set([
  "absent-state",
  "lookup-miss",
  "not-continuable",
])

/** The fixed guard order evaluated after the plan checklist (SPEC.md 3.7). */
export const GUARD_ORDER = [
  "blocked-marker",
  "context-pressure",
  "no-progress",
  "cooldown",
  "cap",
  "backoff",
  "disarmed",
] as const

export type ContinuationGuard = (typeof GUARD_ORDER)[number]

/** Terminal outcome of one gate evaluation. */
export type ContinuationOutcome =
  | {
      readonly action: "injected"
      readonly workId: string
      readonly syntheticId: string
      readonly signature: string
    }
  | { readonly action: "completed"; readonly workId: string; readonly signature: string }
  | {
      readonly action: "skipped"
      readonly reason: ContinuationSkipReason
      readonly workId?: string
      readonly signature?: string
    }

export const SKIP_LOG_PREFIX = "[OMC] boulder-continuation:"

/** One reviewable line per skip, carrying its reason and optional detail. */
export function skipLogLine(reason: ContinuationSkipReason, detail?: string): string {
  return `${SKIP_LOG_PREFIX} skip (${reason})${detail ? `: ${detail}` : ""}`
}
