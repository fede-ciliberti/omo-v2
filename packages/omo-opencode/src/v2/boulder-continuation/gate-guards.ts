/**
 * [OMC] v2 boulder-continuation guard evaluation (task 8).
 *
 * Evaluates the fixed guard order of SPEC.md 3.7 over a turn-end transcript and
 * the per-work counters, plus the transcript helpers the gate reuses. Every
 * guard is pure except for the caller-supplied `now`; the counter returned by
 * the evaluation is the one the gate persists (backoff reset-on-expiry included).
 */

import type { SessionMessageInfo } from "@opencode/client"
import { cooldownActive, shouldStopOnNoProgress } from "./guards"
import { hasAllowedExternalBlockerMarker, transcriptHasContextPressureMarker } from "./markers"
import {
  applyBackoffExpiry,
  shouldStopOnBackoff,
  shouldStopOnCap,
  type WorkCounterState,
} from "./signature"
import type { ContinuationSkipReason } from "./gate-order"

export interface GuardEvaluation {
  /** The guard that skipped, or null to proceed to injection. */
  readonly skip: ContinuationSkipReason | null
  /** Counter to persist (carries the backoff reset-on-expiry when it applies). */
  readonly counter: WorkCounterState
}

/** Concatenated text parts of the most recent assistant message (DIRECTIVE.md 2). */
export function lastAssistantText(messages: readonly SessionMessageInfo[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.type !== "assistant") continue
    return message.content
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
  }
  return undefined
}

/**
 * The most recent user message created strictly after `sinceMs` (SPEC.md 7.4:
 * the stop/re-arm detector runs on the user turns that arrived since the last
 * steer). Returns undefined when no user turn arrived.
 */
export function latestUserMessageSince(
  messages: readonly SessionMessageInfo[],
  sinceMs: number,
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.type !== "user") continue
    if (message.time.created <= sinceMs) continue
    return message.text
  }
  return undefined
}

/**
 * Evaluate the guards in the SPEC.md 3.7 order:
 * blocked-marker, context-pressure, no-progress, cooldown, cap, backoff, then a
 * final disarmed re-check. The first guard that trips wins.
 */
export function evaluateGuards(
  messages: readonly SessionMessageInfo[],
  counter: WorkCounterState,
  signature: string,
  now: number,
): GuardEvaluation {
  if (hasAllowedExternalBlockerMarker(lastAssistantText(messages))) {
    return { skip: "blocked-marker", counter }
  }

  if (transcriptHasContextPressureMarker([...messages])) {
    return { skip: "context-pressure", counter }
  }

  // No-progress (SPEC.md 3.3): the signature this turn would repeat the stored
  // one. Check the candidate count so a never-touching agent converges to two
  // steers (D12 criterion 2), not three.
  const repeats = counter.signature !== null && counter.signature === signature
  const candidate = repeats ? counter.consecutive_no_progress + 1 : 0
  if (shouldStopOnNoProgress(candidate)) {
    return { skip: "no-progress", counter }
  }

  if (cooldownActive(counter.last_injected_at, now)) {
    return { skip: "cooldown", counter }
  }

  if (shouldStopOnCap(counter)) {
    return { skip: "cap", counter }
  }

  if (shouldStopOnBackoff(counter, now)) {
    return { skip: "backoff", counter }
  }

  const afterExpiry = applyBackoffExpiry(counter, now)
  if (afterExpiry.disarmed) {
    return { skip: "disarmed", counter: afterExpiry }
  }

  return { skip: null, counter: afterExpiry }
}
