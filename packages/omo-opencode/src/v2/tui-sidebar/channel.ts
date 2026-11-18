import type { Plugin } from "@opencode/plugin"

import { HEARTBEAT_MS, WRITE_DEBOUNCE_MS } from "../../features/tui-sidebar/constants"
import { canonicalProjectDir } from "../../features/tui-sidebar/project-dir"
import type { TuiRuntimeSnapshot } from "../../features/tui-sidebar/snapshot-schema"
import { listActiveBackgroundTasks } from "../orchestration"
import { readActiveLoop } from "./loop-source"
import { buildSidebarSnapshot, type SidebarSession, type SidebarTask } from "./producer"

type PluginContext = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]

/**
 * [OMC] V2 sidebar channel (server side).
 *
 * V1 wrote a JSON mirror and the TUI polled it. V2 pushes instead: this module
 * rebuilds the same snapshot and hands it to the RPC emitter, which the TUI
 * receives as `rpc.omo-sidebar.sidebar-snapshot` (measured at 11-12 ms across
 * processes). A 2 s heartbeat doubles as the snapshot-on-attach path and as a
 * stale-data guard: a TUI that stopped receiving treats the payload as stale
 * after its own freshness window.
 *
 * `ctx.storage` is deliberately NOT used: it is not shared between the server
 * and TUI processes (see the channel spike evidence).
 */

const EXECUTION_EVENTS = [
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
] as const

const SESSION_EVENTS = [
  "session.created",
  "session.deleted",
  "session.agent.selected",
] as const

const SUBSCRIBED_EVENTS = [...EXECUTION_EVENTS, ...SESSION_EVENTS]

/** Session leaves the running set on any of these. */
const STOP_EVENTS = new Set<string>([
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.deleted",
])

type Emit = (snapshot: TuiRuntimeSnapshot) => Promise<void>

export type SidebarChannel = {
  /** Current snapshot, rebuilt when no emit has happened yet. */
  snapshot: () => Promise<TuiRuntimeSnapshot>
  /** Last snapshot handed to the emitter, or null before the first build. */
  latest: () => TuiRuntimeSnapshot | null
  /** Starts the heartbeat and the event subscription. Returns the cleanup. */
  start: (emit: Emit) => Promise<() => Promise<void>>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readString(source: unknown, key: string): string | null {
  if (!isRecord(source)) {
    return null
  }
  const value = source[key]
  return typeof value === "string" ? value : null
}

function readSessionID(event: unknown): string | null {
  if (!isRecord(event)) {
    return null
  }
  return readString(event.data, "sessionID") ?? readString(event.data, "sessionId")
}

function readSessionDirectory(event: unknown): string | null {
  if (!isRecord(event) || !isRecord(event.data)) {
    return null
  }
  const location = event.data.location
  return readString(location, "directory")
}

function normalizeSessionList(raw: unknown): SidebarSession[] {
  if (!isRecord(raw)) {
    return []
  }
  const rows = Array.isArray(raw.data) ? raw.data : []
  const sessions: SidebarSession[] = []
  for (const row of rows) {
    const id = readString(row, "id")
    if (id === null) {
      continue
    }
    sessions.push({ id, agent: readString(row, "agent") })
  }
  return sessions
}

function normalizeTasks(tasks: readonly unknown[]): SidebarTask[] {
  const rows: SidebarTask[] = []
  for (const task of tasks) {
    const id = readString(task, "id")
    const agent = readString(task, "agent")
    const status = readString(task, "status")
    if (id === null || agent === null || status === null) {
      continue
    }
    rows.push({
      id,
      parentSessionId: readString(task, "parentSessionId") ?? "",
      description: readString(task, "description") ?? "",
      agent,
      status,
    })
  }
  return rows
}

export function createSidebarChannel(ctx: PluginContext): SidebarChannel {
  const directory = ctx.location?.directory
  const running = new Map<string, string | null>()
  let latest: TuiRuntimeSnapshot | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let inFlight = false
  let disposed = false
  let heartbeat: ReturnType<typeof setInterval> | null = null

  const build = async (): Promise<TuiRuntimeSnapshot> => {
    let sessions: SidebarSession[] = []
    try {
      sessions = normalizeSessionList(await ctx.session.list({}))
    } catch {
      sessions = []
    }
    let tasks: readonly unknown[] = []
    try {
      tasks = listActiveBackgroundTasks()
    } catch {
      tasks = []
    }
    const snapshot = buildSidebarSnapshot({
      projectDir: directory ?? process.cwd(),
      sessions,
      tasks: normalizeTasks(tasks),
      running,
      loop: readActiveLoop(directory ?? process.cwd()),
      now: Date.now(),
    })
    latest = snapshot
    return snapshot
  }

  const snapshot = async (): Promise<TuiRuntimeSnapshot> => latest ?? build()

  const flush = (emit: Emit): void => {
    if (disposed || inFlight) {
      return
    }
    inFlight = true
    void build()
      .then((value) => emit(value))
      .catch(() => undefined)
      .finally(() => {
        inFlight = false
      })
  }

  const schedule = (emit: Emit): void => {
    if (disposed) {
      return
    }
    if (timer !== null) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      flush(emit)
    }, WRITE_DEBOUNCE_MS)
  }

  const start = async (emit: Emit): Promise<() => Promise<void>> => {
    heartbeat = setInterval(() => flush(emit), HEARTBEAT_MS)

    const controller = new AbortController()
    const iterable = ctx.event.subscribe({ signal: controller.signal })

    void (async () => {
      try {
        for await (const event of iterable) {
          if (disposed) {
            break
          }
          const type = readString(event, "type")
          const sessionID = readSessionID(event)
          const eventDirectory = readSessionDirectory(event)
          if (sessionID !== null && eventDirectory !== null && directory !== undefined) {
            if (canonicalProjectDir(eventDirectory) !== canonicalProjectDir(directory)) {
              continue
            }
          }
          if (type !== null && sessionID !== null) {
            if (type === "session.execution.started") {
              running.set(sessionID, running.get(sessionID) ?? null)
            } else if (STOP_EVENTS.has(type)) {
              running.delete(sessionID)
            }
          }
          schedule(emit)
        }
      } catch {
        // A closed stream is a normal shutdown; the heartbeat keeps the last
        // snapshot alive until dispose.
      }
    })()

    flush(emit)

    return async () => {
      disposed = true
      controller.abort()
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      if (heartbeat !== null) {
        clearInterval(heartbeat)
        heartbeat = null
      }
    }
  }

  return { snapshot, latest: () => latest, start }
}
