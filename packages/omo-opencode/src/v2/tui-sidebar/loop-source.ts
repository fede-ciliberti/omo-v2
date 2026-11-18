import type { BoulderState, BoulderWorkState } from "@oh-my-opencode/boulder-state"
import { getBoulderWorks, getPlanChecklist, readBoulderState, resolveBoulderPlanPathForWork } from "@oh-my-opencode/boulder-state"

import type { LoopState } from "../../features/tui-sidebar/state-types"
import { log } from "../../shared/logger"
import { isContinuableStatus } from "../boulder-continuation/lookup"

/**
 * [OMC] V2 sidebar loop source (server side, read-only).
 *
 * The V1 sidebar read `.omo/ulw-loop/<dir>/goals.json`, an artifact the omo-senpi
 * engine writes. OpenCode never produces it, so the V2 source is the boulder
 * state the `ulw-execute` flow already maintains: the active work names a plan,
 * and the plan's checkboxes are the goals.
 *
 * `pass`/`fail` have no counterpart here: V1 counted `successCriteria` statuses,
 * and no OpenCode artifact records a verifier verdict per goal. This source
 * reports only what the plan can prove (done/total/pending/blocked) plus the
 * first open task.
 *
 * Read-only by design: the sidebar must never demote a stale work or complete a
 * boulder as a side effect of being rendered.
 */
export function readActiveLoop(directory: string): LoopState {
  try {
    return readLoop(directory)
  } catch (error) {
    if (error instanceof Error) {
      log(`[tui-sidebar] loop source failed: ${error.message}`)
      return { kind: "none" }
    }
    throw error
  }
}

function readLoop(directory: string): LoopState {
  const state = readBoulderState(directory)
  if (state === null) {
    return { kind: "none" }
  }

  const work = selectContinuableWork(state)
  if (work === null) {
    return { kind: "none" }
  }

  const checklist = getPlanChecklist(resolveBoulderPlanPathForWork(directory, work))
  if (checklist.total === 0) {
    // A plan with no checkboxes has nothing to track; so does a plan path that
    // points at a worktree that no longer exists.
    return { kind: "none" }
  }

  return {
    kind: "live",
    goalsDone: checklist.completed,
    goalsTotal: checklist.total,
    pending: checklist.remaining,
    // `[~]` counts toward the total but neither as completed nor as actionable,
    // so the remainder of the plan is exactly the blocked rows.
    blocked: Math.max(0, checklist.total - checklist.completed - checklist.remaining),
    activeTask: checklist.nextTaskLabel,
  }
}

/**
 * The work the continuation engine would resume: `active_work_id` when it names
 * a continuable work, otherwise the most recently updated continuable one.
 */
function selectContinuableWork(state: BoulderState): BoulderWorkState | null {
  const continuable = getBoulderWorks(state).filter((work) => isContinuableStatus(work.status))
  if (continuable.length === 0) {
    return null
  }

  const activeId = state.active_work_id
  if (typeof activeId === "string") {
    const active = continuable.find((work) => work.work_id === activeId)
    if (active !== undefined) {
      return active
    }
  }

  return [...continuable].sort((left, right) => updatedAtMs(right) - updatedAtMs(left))[0] ?? null
}

function updatedAtMs(work: BoulderWorkState): number {
  const parsed = Date.parse(work.updated_at ?? work.started_at)
  return Number.isNaN(parsed) ? 0 : parsed
}
