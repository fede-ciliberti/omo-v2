/**
 * [OMC] v2 boulder-continuation loop (task 8).
 *
 * Subscription lifecycle for the continuation gate. On every
 * `session.execution.succeeded` turn end it arms a per-session debounce timer,
 * then runs `evaluateContinuation`. The four SPEC.md 3.5 user-activity events
 * cancel a pending debounce, so a user message inside the window produces zero
 * synthetic. The stop function aborts the stream and clears every timer.
 */

import type { SessionInboxSynthetic, SessionMessageInfo } from "@opencode/client"
import {
  completeBoulder,
  getPlanChecklist,
  readBoulderStateDetailed,
  reconcileStaleWorks,
  resolveBoulderPlanPathForWork,
} from "@oh-my-opencode/boulder-state"
import { DEBOUNCE_WINDOW_MIN_MS, isDebounceCancelledBy } from "./guards"
import { PRESSURE_SCAN_LIMIT } from "./markers"
import { createStorageCounterStore, type ContinuationStorage } from "./gate-store"
import {
  evaluateContinuation,
  type ContinuationDeps,
  type ContinuationLogger,
} from "./gate"
import { createDebounceManager, defaultTimers, type ContinuationTimers } from "./loop-debounce"
import type { ContinuationSyntheticInput } from "./inject"
import type { ContinuationOutcome } from "./gate-order"

export type { ContinuationTimers } from "./loop-debounce"

/** One event as delivered by the V2 shared stream (`type` + optional `data`). */
export interface ContinuationHostEvent {
  readonly type: string
  readonly data?: unknown
}

/** The plugin-context slice the loop needs; the real `PluginContext` satisfies it. */
export interface ContinuationHostContext {
  readonly location: { readonly directory: string }
  readonly event: {
    subscribe(options?: { readonly signal?: AbortSignal }): AsyncIterable<ContinuationHostEvent>
  }
  readonly session: {
    context(input: { readonly sessionID: string }): Promise<SessionMessageInfo[]>
    synthetic(input: ContinuationSyntheticInput): Promise<SessionInboxSynthetic>
  }
  readonly storage: ContinuationStorage
}

export interface ContinuationLoopOptions {
  /** Partial dependency override (tests inject transcript/storage/boulder fakes). */
  readonly deps?: Partial<ContinuationDeps>
  /** Debounce window in ms (SPEC.md 3.5 band; default 3s). */
  readonly debounceWindowMs?: number
  /** Transcript entries scanned per evaluation (default 20). */
  readonly scanLimit?: number
  /** Timer surface; tests inject a manual scheduler. */
  readonly timers?: ContinuationTimers
  /** Observer invoked with every gate decision (T11 RPC `lastDecision`). */
  readonly onDecision?: (sessionId: string, outcome: ContinuationOutcome) => void
}

/** Mirror of `extractSessionIdFromEvent` in `../orchestration.ts`. */
export function extractSessionIdFromEvent(event: ContinuationHostEvent): string | undefined {
  const data = event.data
  if (data && typeof data === "object" && "sessionID" in data) {
    const sessionID = (data as { sessionID?: unknown }).sessionID
    if (typeof sessionID === "string") return sessionID
  }
  return undefined
}

/** Default dependency binding: `ctx.storage`, the boulder-state package and the session domain. */
export function createContinuationDeps(
  ctx: ContinuationHostContext,
  overrides: Partial<ContinuationDeps> = {},
): ContinuationDeps {
  const log: ContinuationLogger = {
    info: (message) => console.log(message),
    warn: (message) => console.warn(message),
  }
  return {
    directory: ctx.location.directory,
    now: () => Date.now(),
    log,
    counters: createStorageCounterStore(ctx.storage),
    boulder: {
      readState: (directory) => readBoulderStateDetailed(directory),
      reconcileStaleWorks: (directory) => {
        reconcileStaleWorks(directory)
      },
      getPlanChecklist: (planPath) => getPlanChecklist(planPath),
      resolvePlanPath: (directory, work) => resolveBoulderPlanPathForWork(directory, work),
      completeBoulder: (directory, workId) => {
        completeBoulder(directory, workId)
      },
    },
    session: {
      listMessages: (sessionID, limit) =>
        ctx.session.context({ sessionID }).then((messages) => messages.slice(-limit)),
      inject: (_sessionID, input) => ctx.session.synthetic(input),
    },
    ...overrides,
  }
}

/**
 * Subscribe the continuation gate to the V2 event stream. Returns the stop
 * function that aborts the stream and cancels every pending debounce.
 */
export function startContinuationLoop(
  ctx: ContinuationHostContext,
  options: ContinuationLoopOptions = {},
): () => void {
  const controller = new AbortController()
  const timers = options.timers ?? defaultTimers
  const windowMs = options.debounceWindowMs ?? DEBOUNCE_WINDOW_MIN_MS
  const debounce = createDebounceManager(windowMs, timers)
  const deps: ContinuationDeps = {
    ...createContinuationDeps(ctx, options.deps),
    debounce: (sessionId) => debounce.wait(sessionId),
    scanLimit: options.scanLimit ?? PRESSURE_SCAN_LIMIT,
  }

  const handleEvent = (event: ContinuationHostEvent): void => {
    const sessionId = extractSessionIdFromEvent(event)
    if (sessionId === undefined) return
    if (event.type === "session.execution.succeeded") {
      debounce.arm(sessionId)
      void evaluateContinuation(deps, sessionId)
        .then((outcome) => options.onDecision?.(sessionId, outcome))
        .catch((error) => {
          deps.log.warn(
            `[OMC] boulder-continuation: evaluation failed for ${sessionId}: ${String(error)}`,
          )
        })
      return
    }
    if (isDebounceCancelledBy(event.type)) debounce.cancel(sessionId)
  }

  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (controller.signal.aborted) break
        handleEvent(event)
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        deps.log.warn(`[OMC] boulder-continuation: event loop error: ${String(error)}`)
      }
    }
  })()

  return () => {
    controller.abort()
    debounce.cancelAll()
  }
}
