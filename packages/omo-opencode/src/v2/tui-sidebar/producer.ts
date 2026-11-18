import { MAX_AGENTS, MAX_JOBS, SNAPSHOT_SCHEMA_VERSION } from "../../features/tui-sidebar/constants"
import type { AgentRow, AgentStatus, JobRow, LoopState } from "../../features/tui-sidebar/state-types"
import type { TuiRuntimeSnapshot } from "../../features/tui-sidebar/snapshot-schema"

/**
 * [OMC] V2 sidebar producer — turns the plugin process state into the same
 * snapshot shape the V1 sidebar consumed (`TuiRuntimeSnapshot`, version 1).
 *
 * V1 wrote that snapshot to a JSON file and the TUI polled it. V2 delivers the
 * same payload over the `omo` RPC event (see `./channel.ts`), so the derivation
 * stays a pure function and the render layer is unchanged.
 *
 * Everything here degrades: an unknown status, a missing agent or an empty
 * description never throws and never leaks prompt text.
 */

export type SidebarSession = {
  readonly id: string
  readonly agent?: string | null
}

export type SidebarTask = {
  readonly id: string
  readonly parentSessionId: string
  readonly description: string
  readonly agent: string
  readonly status: string
}

/** sessionID -> agent name (null when the agent is not known yet). */
export type RunningSessions = ReadonlyMap<string, string | null>

export type SnapshotInput = {
  readonly projectDir: string
  readonly sessions: readonly SidebarSession[]
  readonly tasks: readonly SidebarTask[]
  readonly running: RunningSessions
  readonly loop: LoopState
  readonly now: number
}

const TASK_STATUSES = ["pending", "running", "completed", "error", "cancelled", "interrupt"] as const
type TaskStatus = (typeof TASK_STATUSES)[number]

const TITLE_MAX = 60

const AGENT_STATUS_PRIORITY: Record<AgentStatus, number> = {
  running: 0,
  busy: 1,
  retry: 2,
  error: 3,
  idle: 4,
}

function isTaskStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value)
}

/**
 * Collapses a task description into a short, prompt-free title. The registry
 * already redacts `prompt`; this keeps the visible label bounded and strips
 * control characters so a stray newline cannot break the sidebar layout.
 */
export function safeTaskTitle(description: string | null | undefined): string {
  const flattened = (description ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
  if (flattened.length === 0) {
    return "background task"
  }
  return flattened.length <= TITLE_MAX ? flattened : `${flattened.slice(0, TITLE_MAX - 3)}...`
}

function agentStatusForTask(status: TaskStatus): AgentStatus {
  if (status === "running") return "running"
  if (status === "pending") return "busy"
  return "idle"
}

function putAgent(target: Map<string, AgentStatus>, name: string | null | undefined, status: AgentStatus): void {
  const label = (name ?? "").trim()
  if (label.length === 0) {
    return
  }
  const current = target.get(label)
  if (current === undefined || AGENT_STATUS_PRIORITY[status] < AGENT_STATUS_PRIORITY[current]) {
    target.set(label, status)
  }
}

function toJobRow(task: SidebarTask): JobRow {
  const status: TaskStatus = isTaskStatus(task.status) ? task.status : "pending"
  return {
    title: safeTaskTitle(task.description),
    status,
    // The V2 registry does not track per-task tool usage; the row renders
    // `0` / `none` instead of inventing numbers.
    toolCalls: null,
    lastTool: null,
  }
}

export function buildSidebarSnapshot(input: SnapshotInput): TuiRuntimeSnapshot {
  const agents = new Map<string, AgentStatus>()

  for (const session of input.sessions) {
    if (!input.running.has(session.id)) {
      continue
    }
    const agent = input.running.get(session.id) ?? session.agent ?? null
    putAgent(agents, agent, "running")
  }

  const tasks = input.tasks.slice(0, MAX_JOBS)
  for (const task of tasks) {
    const status: TaskStatus = isTaskStatus(task.status) ? task.status : "pending"
    putAgent(agents, task.agent, agentStatusForTask(status))
  }

  const activeAgents: AgentRow[] = [...agents.entries()]
    .map(([name, status]) => ({ name, status }))
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, MAX_AGENTS)

  return {
    version: SNAPSHOT_SCHEMA_VERSION,
    projectDir: input.projectDir,
    updatedAt: input.now,
    activeAgents,
    jobBoard: tasks.map(toJobRow),
    // The source returns `none` when no continuable work owns a plan, which the
    // wire contract expresses as `null`.
    loop: input.loop.kind === "live" ? input.loop : null,
  }
}
