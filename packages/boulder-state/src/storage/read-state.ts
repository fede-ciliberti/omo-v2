import type { BoulderState, BoulderWorkResumeOption, BoulderWorkState, TaskSessionState } from "../types"
import { resolveBoulderPlanPathForWork } from "./path"
import { getPlanProgress } from "./plan-progress"
import { readBoulderStateQuiet } from "./read-state-detailed"
import { buildWorkFromMirror, isValidWorkStatus, normalizeSessionId, parseIsoToMs } from "./shared"

export type { BoulderStateReadResult } from "./read-state-detailed"
export { readBoulderStateDetailed } from "./read-state-detailed"

export function readBoulderState(directory: string): BoulderState | null {
  return readBoulderStateQuiet(directory)
}

export function getBoulderWorks(state: BoulderState): BoulderWorkState[] {
  if (state.works && typeof state.works === "object") {
    return Object.values(state.works).filter((work): work is BoulderWorkState => work != null)
  }

  if (!state.active_plan || !state.plan_name || !state.started_at) {
    return []
  }

  return [buildWorkFromMirror(state)]
}

export function getActiveWorks(directory: string): BoulderWorkState[] {
  const state = readBoulderState(directory)
  if (!state) {
    return []
  }

  return getBoulderWorks(state).filter((work) => work.status !== "completed" && work.status !== "abandoned")
}

export function getWorkById(directory: string, workId: string): BoulderWorkState | null {
  const state = readBoulderState(directory)
  if (!state) {
    return null
  }

  return getBoulderWorks(state).find((work) => work.work_id === workId) ?? null
}

export function getWorkByPlanName(
  directory: string,
  planName: string,
  options?: { worktreePath?: string },
): BoulderWorkState | null {
  const state = readBoulderState(directory)
  if (!state) {
    return null
  }

  const worktreePath = options?.worktreePath
  return getBoulderWorks(state).find((work) => {
    if (work.plan_name !== planName) {
      return false
    }

    return worktreePath ? work.worktree_path === worktreePath : true
  }) ?? null
}

export function getWorkForSession(directory: string, sessionId: string): BoulderWorkState | null {
  const state = readBoulderState(directory)
  if (!state) {
    return null
  }

  const normalizedSessionId = normalizeSessionId(sessionId)
  let newestWork: BoulderWorkState | null = null
  let newestWorkMs = 0

  for (const work of getBoulderWorks(state)) {
    if (!work.session_ids.includes(normalizedSessionId)) {
      continue
    }

    const workMs = parseIsoToMs(work.updated_at ?? work.started_at) ?? 0
    if (!newestWork || workMs > newestWorkMs) {
      newestWork = work
      newestWorkMs = workMs
    }
  }

  if (newestWork) {
    return newestWork
  }

  return state.session_ids.includes(normalizedSessionId) ? buildWorkFromMirror(state) : null
}

export function getWorkResumeOptions(directory: string): BoulderWorkResumeOption[] {
  const state = readBoulderState(directory)
  if (!state) {
    return []
  }

  return getBoulderWorks(state)
    .filter((work) => work.status !== "completed" && work.status !== "abandoned")
    .map((work) => {
      const progress = getPlanProgress(resolveBoulderPlanPathForWork(directory, work))
      return {
        work_id: work.work_id,
        plan_name: work.plan_name,
        active_plan: work.active_plan,
        worktree_path: work.worktree_path,
        status: work.status && isValidWorkStatus(work.status) ? work.status : "active",
        started_at: work.started_at,
        updated_at: work.updated_at ?? work.started_at,
        ended_at: work.ended_at,
        elapsed_ms: work.elapsed_ms,
        session_count: work.session_ids.length,
        progress,
        is_current_mirror: state.active_work_id === work.work_id,
      }
    })
}

export function getTaskSessionState(directory: string, taskKey: string): TaskSessionState | null {
  const state = readBoulderState(directory)
  if (state?.active_work_id) {
    const work = state.works?.[state.active_work_id]
    const taskSession = work?.task_sessions?.[taskKey]
    if (taskSession) {
      return taskSession
    }
  }

  if (!state?.task_sessions) {
    return null
  }

  return state.task_sessions[taskKey] ?? null
}
