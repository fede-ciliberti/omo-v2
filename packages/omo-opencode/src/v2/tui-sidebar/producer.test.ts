import { describe, expect, it } from "bun:test"

import { MAX_AGENTS, MAX_JOBS, SNAPSHOT_SCHEMA_VERSION } from "../../features/tui-sidebar/constants"
import type { LoopLive, LoopState } from "../../features/tui-sidebar/state-types"
import { buildSidebarSnapshot, safeTaskTitle, type SidebarTask } from "./producer"

function task(overrides: Partial<SidebarTask> & { id: string }): SidebarTask {
  return {
    id: overrides.id,
    parentSessionId: overrides.parentSessionId ?? "ses_parent",
    description: overrides.description ?? "explore the repo",
    agent: overrides.agent ?? "sisyphus-junior",
    status: overrides.status ?? "running",
  }
}

const base = {
  projectDir: "/tmp/project",
  now: 1_700_000_000_000,
  loop: { kind: "none" } as LoopState,
}

describe("v2 sidebar producer", () => {
  it("#given a running session and an active task #when building #then both agents and the job row appear", () => {
    // given
    const input = {
      ...base,
      sessions: [{ id: "ses_a", agent: "sisyphus" }],
      tasks: [task({ id: "bg_1", description: "write the docs", agent: "librarian" })],
      running: new Map<string, string | null>([["ses_a", null]]),
    }

    // when
    const snapshot = buildSidebarSnapshot(input)

    // then
    expect(snapshot.version).toBe(SNAPSHOT_SCHEMA_VERSION)
    expect(snapshot.projectDir).toBe("/tmp/project")
    expect(snapshot.updatedAt).toBe(base.now)
    expect(snapshot.activeAgents).toEqual([
      { name: "librarian", status: "running" },
      { name: "sisyphus", status: "running" },
    ])
    expect(snapshot.jobBoard).toEqual([
      { title: "write the docs", status: "running", toolCalls: null, lastTool: null },
    ])
    expect(snapshot.loop).toBeNull()
  })

  it("#given a live loop #when building #then the snapshot carries it unchanged", () => {
    // given
    const loop: LoopLive = {
      kind: "live",
      goalsDone: 2,
      goalsTotal: 5,
      pending: 2,
      blocked: 1,
      activeTask: "T4 wire the producer",
    }

    // when
    const snapshot = buildSidebarSnapshot({
      ...base,
      sessions: [],
      tasks: [],
      running: new Map<string, string | null>(),
      loop,
    })

    // then
    expect(snapshot.loop).toEqual(loop)
  })

  it("#given an idle session #when building #then it is not reported as active", () => {
    // given
    const input = {
      ...base,
      sessions: [{ id: "ses_idle", agent: "oracle" }],
      tasks: [],
      running: new Map<string, string | null>(),
    }

    // when
    const snapshot = buildSidebarSnapshot(input)

    // then
    expect(snapshot.activeAgents).toEqual([])
    expect(snapshot.jobBoard).toEqual([])
  })

  it("#given a pending task #when building #then its agent is busy rather than running", () => {
    // given
    const input = {
      ...base,
      sessions: [],
      tasks: [task({ id: "bg_2", status: "pending", agent: "hephaestus" })],
      running: new Map<string, string | null>(),
    }

    // when
    const snapshot = buildSidebarSnapshot(input)

    // then
    expect(snapshot.activeAgents).toEqual([{ name: "hephaestus", status: "busy" }])
  })

  it("#given the same agent on a session and a task #when building #then it is reported once with the strongest status", () => {
    // given
    const input = {
      ...base,
      sessions: [{ id: "ses_a", agent: "sisyphus" }],
      tasks: [task({ id: "bg_3", status: "pending", agent: "sisyphus" })],
      running: new Map<string, string | null>([["ses_a", null]]),
    }

    // when
    const snapshot = buildSidebarSnapshot(input)

    // then
    expect(snapshot.activeAgents).toEqual([{ name: "sisyphus", status: "running" }])
  })

  it("#given more rows than the caps #when building #then both lists are capped", () => {
    // given
    const tasks = Array.from({ length: MAX_JOBS + 5 }, (_, index) =>
      task({ id: `bg_${index}`, agent: `agent-${index}`, description: `task ${index}` }),
    )

    // when
    const snapshot = buildSidebarSnapshot({ ...base, sessions: [], tasks, running: new Map() })

    // then
    expect(snapshot.jobBoard.length).toBe(MAX_JOBS)
    expect(snapshot.activeAgents.length).toBeLessThanOrEqual(MAX_AGENTS)
  })

  it("#given a multi-line description with control characters #when building #then the title is flat and bounded", () => {
    // given
    const dirty = "line one\n\nline two\t\u0007 " + "x".repeat(200)

    // when
    const title = safeTaskTitle(dirty)

    // then
    expect(title).not.toContain("\n")
    expect(title).not.toContain("\t")
    expect(title.length).toBeLessThanOrEqual(60)
    expect(title.endsWith("...")).toBe(true)
    expect(title.startsWith("line one line two")).toBe(true)
  })

  it("#given an empty description #when building #then the row still has a readable title", () => {
    // given
    const input = {
      ...base,
      sessions: [],
      tasks: [task({ id: "bg_4", description: "" })],
      running: new Map<string, string | null>(),
    }

    // when
    const snapshot = buildSidebarSnapshot(input)

    // then
    expect(snapshot.jobBoard[0]?.title).toBe("background task")
  })

  it("#given an unknown task status #when building #then it degrades to pending instead of leaking through", () => {
    // given
    const input = {
      ...base,
      sessions: [],
      tasks: [task({ id: "bg_5", status: "weird" })],
      running: new Map<string, string | null>(),
    }

    // when
    const snapshot = buildSidebarSnapshot(input)

    // then
    expect(snapshot.jobBoard[0]?.status).toBe("pending")
  })
})
