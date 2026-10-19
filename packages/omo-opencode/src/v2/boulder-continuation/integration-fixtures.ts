/**
 * [OMC] v2 boulder-continuation integration fixtures (task 12).
 *
 * Plan markdown, transcript message builders and temp-dir `.omo` writers used by
 * the integration harness. Kept separate from the harness so each file stays
 * under the repo's 200 LOC ceiling.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import type { SessionMessageInfo } from "@opencode/client"
export const PLAN_REL = ".omo/plans/plan.md"
export const WORK_ID = "wk_1"
export const SESSION_ID = "ses_X"

export function openPlanMarkdown(): string {
  return ["# Plan", "", "## TODOs", "- [x] 1. Done task", "- [ ] 2. Open task", ""].join("\n")
}

export function completedPlanMarkdown(): string {
  return ["# Plan", "", "## TODOs", "- [x] 1. Done task", "- [x] 2. Done task", ""].join("\n")
}

export function blockedPlanMarkdown(): string {
  return ["# Plan", "", "## TODOs", "- [~] 1. Blocked task", "- [~] 2. Blocked task", ""].join("\n")
}

export function userMessage(text: string, created: number): SessionMessageInfo {
  return { id: `msg_u_${created}`, type: "user", time: { created }, text }
}

export function assistantMessage(text: string, created: number): SessionMessageInfo {
  return {
    id: `msg_a_${created}`,
    type: "assistant",
    agent: "build",
    model: { id: "test", providerID: "test" },
    time: { created },
    content: [{ type: "text", text }],
  }
}

/** V2-native context-pressure signal: a completed compaction entry (DIRECTIVE 3.3). */
export function compactionMessage(created: number): SessionMessageInfo {
  return {
    id: `msg_c_${created}`,
    type: "compaction",
    time: { created },
    status: "completed",
    reason: "auto",
    summary: "context compacted",
    recent: "recent turns",
  }
}

export interface BoulderFixture {
  readonly sessionIds: readonly string[]
  readonly status?: "active" | "completed" | "paused" | "abandoned"
  readonly worktreePath?: string
}

export function writePlan(dir: string, markdown: string): void {
  const planPath = join(dir, PLAN_REL)
  mkdirSync(dirname(planPath), { recursive: true })
  writeFileSync(planPath, markdown)
}

export function writeBoulder(dir: string, fixture: BoulderFixture): void {
  const now = new Date().toISOString()
  const work = {
    work_id: WORK_ID,
    active_plan: PLAN_REL,
    plan_name: "plan",
    status: fixture.status ?? "active",
    started_at: now,
    updated_at: now,
    session_ids: [...fixture.sessionIds],
    ...(fixture.worktreePath === undefined ? {} : { worktree_path: fixture.worktreePath }),
  }
  const state = {
    schema_version: 2,
    active_work_id: WORK_ID,
    works: { [WORK_ID]: work },
    active_plan: PLAN_REL,
    plan_name: "plan",
    started_at: now,
    updated_at: now,
    status: work.status,
    session_ids: [...fixture.sessionIds],
  }
  mkdirSync(join(dir, ".omo"), { recursive: true })
  writeFileSync(join(dir, ".omo", "boulder.json"), JSON.stringify(state, null, 2))
}

export function writeCorruptBoulder(dir: string): void {
  mkdirSync(join(dir, ".omo"), { recursive: true })
  writeFileSync(join(dir, ".omo", "boulder.json"), "{")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Read the persisted status of the fixture work straight from disk. */
export function readBoulderWorkStatus(dir: string): string | undefined {
  const parsed: unknown = JSON.parse(readFileSync(join(dir, ".omo", "boulder.json"), "utf-8"))
  if (!isRecord(parsed)) return undefined
  const works = parsed["works"]
  if (!isRecord(works)) return undefined
  const work = works[WORK_ID]
  if (!isRecord(work)) return undefined
  const status = work["status"]
  return typeof status === "string" ? status : undefined
}
