/**
 * [OMC] v2 boulder-continuation test fakes (task 8).
 *
 * In-module fakes for the host domains the gate and the loop depend on:
 * transcript, synthetic injection, counter storage, boulder-state and the
 * debounce signal. Not a test file; imported by `gate.test.ts` / `loop.test.ts`.
 */

import type {
  BoulderState,
  BoulderWorkState,
  BoulderWorkStatus,
  PlanChecklist,
} from "@oh-my-opencode/boulder-state"
import type { SessionInboxSynthetic, SessionMessageInfo } from "@opencode/client"
import type {
  ContinuationBoulderPort,
  ContinuationDeps,
  ContinuationLogger,
  ContinuationSessionPort,
} from "./gate"
import type { ContinuationCounterStore } from "./gate-store"
import type { ContinuationSyntheticInput } from "./inject"
import { createWorkCounterState, type WorkCounterState } from "./signature"

export function userMessage(text: string, created: number): SessionMessageInfo {
  return { id: `msg_u_${created}`, type: "user", time: { created }, text }
}

export function assistantMessage(
  text: string,
  created: number,
  finish?: "stop" | "length",
): SessionMessageInfo {
  return {
    id: `msg_a_${created}`,
    type: "assistant",
    agent: "build",
    model: { id: "test", providerID: "test" },
    time: { created },
    content: [{ type: "text", text }],
    ...(finish === undefined ? {} : { finish }),
  }
}

interface HarnessState {
  plan: PlanChecklist
  status: string | undefined
  sessionIds: string[]
  worktreePath: string | undefined
  absent: boolean
  corrupt: boolean
  messages: SessionMessageInfo[]
  failInjection: boolean
  debounceResult: boolean
  nowMs: number
  readCount: number
  reconcileCount: number
}

export type Harness = HarnessState & {
  readonly deps: ContinuationDeps
  readonly synthetics: ContinuationSyntheticInput[]
  readonly infos: string[]
  readonly warns: string[]
  readonly completed: string[]
  readonly counters: Map<string, WorkCounterState>
}

function currentWork(state: HarnessState): BoulderWorkState {
  return {
    work_id: "wk_1",
    active_plan: "plan.md",
    plan_name: "plan",
    status: state.status as BoulderWorkStatus | undefined,
    started_at: "2026-10-01T00:00:00.000Z",
    session_ids: state.sessionIds,
    ...(state.worktreePath === undefined ? {} : { worktree_path: state.worktreePath }),
  }
}

function fakeSynthetic(input: ContinuationSyntheticInput): SessionInboxSynthetic {
  return {
    id: `syn_${input.sessionID}`,
    sessionID: input.sessionID,
    time: { created: 0 },
    type: "synthetic",
    payload: { text: input.text, description: input.description, metadata: input.metadata },
    delivery: "steer",
  }
}

export function makeHarness(): Harness {
  const state: HarnessState = {
    plan: { total: 2, completed: 1, remaining: 1, nextTaskLabel: "T2" },
    status: "active",
    sessionIds: ["opencode:ses_X"],
    worktreePath: undefined,
    absent: false,
    corrupt: false,
    messages: [],
    failInjection: false,
    debounceResult: true,
    nowMs: 10_000,
    readCount: 0,
    reconcileCount: 0,
  }

  const synthetics: ContinuationSyntheticInput[] = []
  const infos: string[] = []
  const warns: string[] = []
  const completed: string[] = []
  const counters = new Map<string, WorkCounterState>()

  const log: ContinuationLogger = {
    info: (message) => infos.push(message),
    warn: (message) => warns.push(message),
  }

  const boulder: ContinuationBoulderPort = {
    readState: () => {
      state.readCount += 1
      if (state.absent) return { status: "absent" }
      if (state.corrupt) return { status: "corrupt", error: new Error("bad json") }
      const boulderState: BoulderState = {
        active_plan: "plan.md",
        plan_name: "plan",
        started_at: "2026-10-01T00:00:00.000Z",
        session_ids: state.sessionIds,
        works: { wk_1: currentWork(state) },
      }
      return { status: "ok", state: boulderState }
    },
    reconcileStaleWorks: () => {
      state.reconcileCount += 1
    },
    getPlanChecklist: () => ({ ...state.plan }),
    resolvePlanPath: () => "plan.md",
    completeBoulder: (_directory, workId) => {
      completed.push(workId)
      state.status = "completed"
    },
  }

  const session: ContinuationSessionPort = {
    listMessages: async () => state.messages,
    inject: async (_sessionID, input) => {
      if (state.failInjection) throw new Error("inject failed")
      synthetics.push(input)
      return fakeSynthetic(input)
    },
  }

  const counterStore: ContinuationCounterStore = {
    read: async (workId) => counters.get(workId) ?? createWorkCounterState(),
    write: async (workId, value) => {
      counters.set(workId, value)
    },
  }

  const deps: ContinuationDeps = {
    directory: "/repo",
    now: () => state.nowMs,
    log,
    counters: counterStore,
    boulder,
    session,
    debounce: async () => state.debounceResult,
  }

  return Object.assign(state, { deps, synthetics, infos, warns, completed, counters })
}
