/**
 * [OMC] v2 boulder-continuation gate dependencies (task 8).
 *
 * The injectable host surfaces the gate needs. Every field enters through
 * `ContinuationDeps`, so the ordered decision runs in tests with in-module
 * fakes and in production bound to the real plugin context. T11 binds these.
 */

import type {
  BoulderStateReadResult,
  BoulderWorkState,
  PlanChecklist,
} from "@oh-my-opencode/boulder-state"
import type { SessionInboxSynthetic, SessionMessageInfo } from "@opencode/client"
import type { ContinuationSyntheticInput } from "./inject"
import type { ContinuationCounterStore } from "./gate-store"

export interface ContinuationLogger {
  readonly info: (message: string) => void
  readonly warn: (message: string) => void
}

export interface ContinuationBoulderPort {
  readState(directory: string): BoulderStateReadResult
  reconcileStaleWorks(directory: string): void
  getPlanChecklist(planPath: string): PlanChecklist
  resolvePlanPath(directory: string, work: BoulderWorkState): string
  completeBoulder(directory: string, workId: string): void
}

export interface ContinuationSessionPort {
  listMessages(sessionID: string, limit: number): Promise<SessionMessageInfo[]>
  inject(sessionID: string, input: ContinuationSyntheticInput): Promise<SessionInboxSynthetic>
}

/** Every host surface the gate needs, injected so tests need no real host. */
export interface ContinuationDeps {
  readonly directory: string
  readonly now: () => number
  readonly log: ContinuationLogger
  readonly counters: ContinuationCounterStore
  readonly boulder: ContinuationBoulderPort
  readonly session: ContinuationSessionPort
  /** Optional debounce gate; resolves true to fire, false when cancelled. */
  readonly debounce?: (sessionId: string) => Promise<boolean>
  /** Transcript entries scanned for the blocker marker / pressure valve. */
  readonly scanLimit?: number
}
