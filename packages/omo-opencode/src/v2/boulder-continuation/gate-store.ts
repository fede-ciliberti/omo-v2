/**
 * [OMC] v2 boulder-continuation counter store (task 8).
 *
 * Per-work counters (SPEC.md 1.1) persist under a namespaced key
 * `boulder-continuation/<work_id>` through an injectable storage surface. The
 * default binding targets `ctx.storage` get/set; tests inject an in-memory map.
 */

import type { JsonValue } from "@opencode/client"
import { createWorkCounterState, type WorkCounterState } from "./signature"

/** Key namespace for the per-work counter entry (SPEC.md 4, D13). */
export const COUNTER_KEY_PREFIX = "boulder-continuation/"

export function counterKey(workId: string): string {
  return `${COUNTER_KEY_PREFIX}${workId}`
}

/** Minimal storage surface; `ctx.storage` get/set satisfies it. */
export interface ContinuationStorage {
  get(key: string): Promise<JsonValue | undefined>
  set(key: string, value: JsonValue): Promise<void>
}

/** Injectable counter persistence keyed by `work_id`. */
export interface ContinuationCounterStore {
  read(workId: string): Promise<WorkCounterState>
  write(workId: string, state: WorkCounterState): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

/**
 * Validate a persisted counter payload. A malformed or missing entry resets to
 * the all-zero state so a corrupt store never reads as fresh budget.
 */
export function parseCounterState(raw: unknown): WorkCounterState {
  if (!isRecord(raw)) return createWorkCounterState()
  return {
    steers_total: numberOr(raw["steers_total"], 0),
    consecutive_no_progress: numberOr(raw["consecutive_no_progress"], 0),
    prompt_failures: numberOr(raw["prompt_failures"], 0),
    last_failure_at: numberOrNull(raw["last_failure_at"]),
    last_injected_at: numberOrNull(raw["last_injected_at"]),
    disarmed: raw["disarmed"] === true,
    signature: typeof raw["signature"] === "string" ? raw["signature"] : null,
  }
}

/** Bind the counter store to a storage surface (default: `ctx.storage`). */
export function createStorageCounterStore(storage: ContinuationStorage): ContinuationCounterStore {
  return {
    read: async (workId) => parseCounterState(await storage.get(counterKey(workId))),
    write: async (workId, state) => {
      await storage.set(counterKey(workId), state as unknown as JsonValue)
    },
  }
}
