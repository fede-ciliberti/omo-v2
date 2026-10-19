/**
 * [OMC] v2 boulder-continuation gate (task 8).
 *
 * The ordered decision that runs on every `session.execution.succeeded` turn
 * end (SPEC.md 3.7, DIRECTIVE.md, LOOKUP.md). Every dependency is injectable so
 * tests drive the gate without a real host: transcript, storage, boulder-state
 * and the debounce timer all enter through `ContinuationDeps`.
 *
 * The ONLY injection route is `session.synthetic` (delivery `steer`, via
 * `injectContinuation`); this module never touches the raw prompt APIs and
 * never writes plan checkboxes.
 */

import { join } from "node:path"
import { getBoulderFilePath } from "@oh-my-opencode/boulder-state"
import type { BoulderWorkState, PlanChecklist } from "@oh-my-opencode/boulder-state"
import { renderDirective, type ContinuationDirectiveState } from "./directive"
import { PRESSURE_SCAN_LIMIT } from "./markers"
import { matchesRearmPhrase, matchesStopPhrase } from "./guards"
import { findWorkForSessionId, isContinuableStatus } from "./lookup"
import { injectContinuation } from "./inject"
import {
  disarm,
  progressSignature,
  rearm,
  recordFailure,
  recordSteer,
  resetFailuresOnAdmission,
} from "./signature"
import { evaluateGuards, latestUserMessageSince } from "./gate-guards"
import type { ContinuationDeps } from "./gate-deps"
import {
  SILENT_SKIP_REASONS,
  SKIP_LOG_PREFIX,
  skipLogLine,
  type ContinuationOutcome,
  type ContinuationSkipReason,
} from "./gate-order"

export type {
  ContinuationBoulderPort,
  ContinuationDeps,
  ContinuationLogger,
  ContinuationSessionPort,
} from "./gate-deps"

function silentSkip(reason: ContinuationSkipReason, workId?: string): ContinuationOutcome {
  return workId === undefined ? { action: "skipped", reason } : { action: "skipped", reason, workId }
}

function loggedSkip(
  deps: ContinuationDeps,
  reason: ContinuationSkipReason,
  detail?: string,
  workId?: string,
): ContinuationOutcome {
  if (!SILENT_SKIP_REASONS.has(reason)) deps.log.info(skipLogLine(reason, detail))
  return workId === undefined
    ? { action: "skipped", reason }
    : { action: "skipped", reason, workId }
}

function directiveState(
  deps: ContinuationDeps,
  work: BoulderWorkState,
  planPath: string,
  checklist: PlanChecklist,
  sessionId: string,
): ContinuationDirectiveState {
  const root = work.worktree_path ?? deps.directory
  return {
    planName: work.plan_name,
    planPath,
    boulderPath: getBoulderFilePath(deps.directory),
    checklist,
    worktreePath: work.worktree_path ?? null,
    ledgerPath: join(root, ".omo", "ulw-execute", "ledger.jsonl"),
    sessionId,
  }
}

/**
 * Evaluate one turn end for `sessionId` and return the decision. A lookup miss,
 * an absent boulder file and a terminal work are silent skips; every other skip
 * logs its reason. On an admitted steer the counter advances and the failure
 * streak resets; on an injection failure the failure streak advances.
 */
export async function evaluateContinuation(
  deps: ContinuationDeps,
  sessionId: string,
): Promise<ContinuationOutcome> {
  const now = deps.now()
  const scanLimit = deps.scanLimit ?? PRESSURE_SCAN_LIMIT

  // 1. Debounce gate (armed by the loop; cancelled by user activity).
  if (deps.debounce) {
    const fire = await deps.debounce(sessionId)
    if (!fire) return loggedSkip(deps, "debounce-cancelled", `session=${sessionId}`)
  }

  // 2. Transcript, reused by the stop/re-arm wiring and the guard scan.
  const messages = await deps.session.listMessages(sessionId, scanLimit)

  // 3. Re-read state (pre-write discipline; absent is silent, corrupt warns).
  const read = deps.boulder.readState(deps.directory)
  if (read.status === "absent") return silentSkip("absent-state")
  if (read.status === "corrupt") return loggedSkip(deps, "corrupt-state", read.error.message)

  // 4. Repair-only stale-work reconcile (no sessions directory).
  deps.boulder.reconcileStaleWorks(deps.directory)

  // 5. Multi-prefix lookup; a miss is a silent skip (LOOKUP.md 5.2).
  const work = findWorkForSessionId(read.state, sessionId)
  if (work === null) return silentSkip("lookup-miss")

  // 6. Status gate (LOOKUP.md 3).
  if (!isContinuableStatus(work.status)) {
    if (work.status === "completed" || work.status === "abandoned") {
      return silentSkip("not-continuable", work.work_id)
    }
    deps.log.warn(
      `${SKIP_LOG_PREFIX} unknown work status "${String(work.status)}" for work_id=${work.work_id} ` +
        "- not continuable, skipping",
    )
    return silentSkip("unknown-status", work.work_id)
  }

  // 7. Checklist and progress signature.
  const planPath = deps.boulder.resolvePlanPath(deps.directory, work)
  const checklist = deps.boulder.getPlanChecklist(planPath)
  const signature = progressSignature(work.work_id, checklist)

  // 8. Nothing remains: idempotent completion, zero synthetic.
  if (checklist.remaining === 0) {
    deps.boulder.completeBoulder(deps.directory, work.work_id)
    return { action: "completed", workId: work.work_id, signature }
  }

  let counter = await deps.counters.read(work.work_id)

  // 8a. Plan progress re-arms (SPEC.md 7.2); a stop phrase this turn wins.
  if (counter.signature !== null && counter.signature !== signature) {
    counter = rearm(counter)
  }
  const userText = latestUserMessageSince(messages, counter.last_injected_at ?? 0)
  if (userText !== undefined) {
    if (matchesStopPhrase(userText)) counter = disarm(counter)
    else if (matchesRearmPhrase(userText)) counter = rearm(counter)
  }

  // 8b. Disarmed skips consume nothing (SPEC.md 7.3).
  if (counter.disarmed) {
    await deps.counters.write(work.work_id, counter)
    return loggedSkip(deps, "disarmed", `work_id=${work.work_id}`, work.work_id)
  }

  // 8c. Guards in the fixed SPEC.md 3.7 order.
  const guard = evaluateGuards(messages, counter, signature, now)
  if (guard.skip !== null) {
    await deps.counters.write(work.work_id, guard.counter)
    return loggedSkip(deps, guard.skip, `work_id=${work.work_id}`, work.work_id)
  }

  // 8d. Inject the directive via the synthetic steer route.
  const text = renderDirective(directiveState(deps, work, planPath, checklist, sessionId))
  try {
    const syntheticId = await injectContinuation(
      { sessionID: sessionId, synthetic: (input) => deps.session.inject(sessionId, input) },
      text,
      `boulder continuation for ${work.work_id}`,
      { work_id: work.work_id, signature },
    )
    const admitted = resetFailuresOnAdmission(recordSteer(counter, signature, now))
    await deps.counters.write(work.work_id, admitted)
    return { action: "injected", workId: work.work_id, syntheticId, signature }
  } catch (error) {
    const failed = recordFailure(counter, now)
    await deps.counters.write(work.work_id, failed)
    return loggedSkip(
      deps,
      "injection-failed",
      error instanceof Error ? error.message : String(error),
      work.work_id,
    )
  }
}
