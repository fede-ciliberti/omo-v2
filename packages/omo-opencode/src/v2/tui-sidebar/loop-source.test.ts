import { afterEach, describe, expect, it } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

import { readActiveLoop } from "./loop-source"

const PLAN_WITH_CHECKBOXES = [
  "# Sample plan",
  "",
  "## TODOs",
  "",
  "- [x] 1. First task",
  "- [ ] 2. Second task",
  "- [~] 3. Blocked task",
  "",
  "## Final Verification Wave",
  "",
  "- [x] F1. Verify it",
  "",
].join("\n")

const PLAN_WITHOUT_CHECKBOXES = ["# Descriptive plan", "", "No checkboxes here.", ""].join("\n")

const startedAt = "2026-11-18T00:00:00.000Z"

const roots: string[] = []

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "omo-sidebar-loop-"))
  roots.push(root)
  return root
}

type ProjectSpec = {
  readonly plans?: Readonly<Record<string, string>>
  readonly boulder?: (planPath: (name: string) => string) => unknown
}

function createProject(spec: ProjectSpec): string {
  const root = createRoot()
  const planDir = join(root, ".omo", "plans")
  mkdirSync(planDir, { recursive: true })
  const planPath = (name: string): string => join(planDir, name)

  for (const [name, content] of Object.entries(spec.plans ?? {})) {
    writeFileSync(planPath(name), content, "utf-8")
  }
  if (spec.boulder !== undefined) {
    writeFileSync(join(root, ".omo", "boulder.json"), JSON.stringify(spec.boulder(planPath)), "utf-8")
  }

  return root
}

function boulderWithOneWork(
  planPath: string,
  status: string | undefined,
  updatedAt = startedAt,
): Record<string, unknown> {
  const work: Record<string, unknown> = {
    work_id: "w1",
    active_plan: planPath,
    plan_name: "sample",
    started_at: startedAt,
    updated_at: updatedAt,
    session_ids: [],
  }
  if (status !== undefined) {
    work.status = status
  }

  return {
    schema_version: 2,
    active_work_id: "w1",
    works: { w1: work },
    active_plan: planPath,
    plan_name: "sample",
    started_at: startedAt,
    session_ids: [],
  }
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("tui sidebar loop source", () => {
  it("#given a project with no boulder state #when reading #then it reports none", () => {
    // given
    const root = createRoot()

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({ kind: "none" })
  })

  it("#given a corrupt boulder file #when reading #then it reports none", () => {
    // given
    const root = createRoot()
    mkdirSync(join(root, ".omo"), { recursive: true })
    writeFileSync(join(root, ".omo", "boulder.json"), "{not json", "utf-8")

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({ kind: "none" })
  })

  it("#given an active work and a plan with checkboxes #when reading #then it reports the plan counts", () => {
    // given
    const root = createProject({
      plans: { "sample.md": PLAN_WITH_CHECKBOXES },
      boulder: (planPath) => boulderWithOneWork(planPath("sample.md"), "active"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({
      kind: "live",
      goalsDone: 2,
      goalsTotal: 4,
      pending: 1,
      blocked: 1,
      activeTask: "2. Second task",
    })
  })

  it("#given a paused work #when reading #then it still reports the loop", () => {
    // given
    const root = createProject({
      plans: { "sample.md": PLAN_WITH_CHECKBOXES },
      boulder: (planPath) => boulderWithOneWork(planPath("sample.md"), "paused"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state.kind).toBe("live")
  })

  it("#given a completed work #when reading #then it reports none", () => {
    // given
    const root = createProject({
      plans: { "sample.md": PLAN_WITH_CHECKBOXES },
      boulder: (planPath) => boulderWithOneWork(planPath("sample.md"), "completed"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({ kind: "none" })
  })

  it("#given a work with an unknown status #when reading #then it reports none", () => {
    // given
    const root = createProject({
      plans: { "sample.md": PLAN_WITH_CHECKBOXES },
      boulder: (planPath) => boulderWithOneWork(planPath("sample.md"), "awaiting-user-ok"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({ kind: "none" })
  })

  it("#given a plan without checkboxes #when reading #then it reports none", () => {
    // given
    const root = createProject({
      plans: { "sample.md": PLAN_WITHOUT_CHECKBOXES },
      boulder: (planPath) => boulderWithOneWork(planPath("sample.md"), "active"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({ kind: "none" })
  })

  it("#given an active work whose plan file is gone #when reading #then it reports none", () => {
    // given
    const root = createProject({
      boulder: (planPath) => boulderWithOneWork(planPath("missing.md"), "active"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({ kind: "none" })
  })

  it("#given an active work id and a newer paused work #when reading #then it follows the active id", () => {
    // given
    const root = createProject({
      plans: { "active.md": PLAN_WITH_CHECKBOXES, "paused.md": PLAN_WITHOUT_CHECKBOXES },
      boulder: (planPath) => ({
        schema_version: 2,
        active_work_id: "w1",
        works: {
          w1: {
            work_id: "w1",
            active_plan: planPath("active.md"),
            plan_name: "active",
            status: "active",
            started_at: startedAt,
            updated_at: "2026-11-18T00:00:00.000Z",
            session_ids: [],
          },
          w2: {
            work_id: "w2",
            active_plan: planPath("paused.md"),
            plan_name: "paused",
            status: "paused",
            started_at: startedAt,
            updated_at: "2026-11-18T06:00:00.000Z",
            session_ids: [],
          },
        },
      }),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state.kind).toBe("live")
    expect(state).toEqual({
      kind: "live",
      goalsDone: 2,
      goalsTotal: 4,
      pending: 1,
      blocked: 1,
      activeTask: "2. Second task",
    })
  })

  it("#given no active work id and two continuable works #when reading #then it takes the newest", () => {
    // given
    const root = createProject({
      plans: { "old.md": PLAN_WITHOUT_CHECKBOXES, "new.md": PLAN_WITH_CHECKBOXES },
      boulder: (planPath) => ({
        schema_version: 2,
        works: {
          old: {
            work_id: "old",
            active_plan: planPath("old.md"),
            plan_name: "old",
            status: "active",
            started_at: startedAt,
            updated_at: "2026-11-17T00:00:00.000Z",
            session_ids: [],
          },
          fresh: {
            work_id: "fresh",
            active_plan: planPath("new.md"),
            plan_name: "new",
            status: "paused",
            started_at: startedAt,
            updated_at: "2026-11-18T09:00:00.000Z",
            session_ids: [],
          },
        },
      }),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state.kind).toBe("live")
    expect(state).toEqual({
      kind: "live",
      goalsDone: 2,
      goalsTotal: 4,
      pending: 1,
      blocked: 1,
      activeTask: "2. Second task",
    })
  })

  it("#given a plan whose only open row is blocked #when reading #then pending is zero and blocked is one", () => {
    // given
    const root = createProject({
      plans: {
        "sample.md": ["## TODOs", "", "- [x] 1. Done", "- [~] 2. Blocked", ""].join("\n"),
      },
      boulder: (planPath) => boulderWithOneWork(planPath("sample.md"), "active"),
    })

    // when
    const state = readActiveLoop(root)

    // then
    expect(state).toEqual({
      kind: "live",
      goalsDone: 1,
      goalsTotal: 2,
      pending: 0,
      blocked: 1,
      activeTask: null,
    })
  })
})
