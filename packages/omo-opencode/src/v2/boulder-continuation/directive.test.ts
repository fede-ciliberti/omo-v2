import { describe, expect, it } from "bun:test"
import type { PlanChecklist } from "@oh-my-opencode/boulder-state"
import {
  NEXT_TASK_LABEL_NONE,
  renderDirective,
  type ContinuationDirectiveState,
} from "./directive"

/**
 * [OMC] v2 boulder-continuation directive render (task 7).
 *
 * Asserts placeholder substitution and the machine-consumed render rules of
 * DIRECTIVE.md section 1.1 only; never the authored prose of the directive.
 */

function checklist(overrides: Partial<PlanChecklist> = {}): PlanChecklist {
  return { total: 9, completed: 3, remaining: 6, nextTaskLabel: "T4", ...overrides }
}

function state(overrides: Partial<ContinuationDirectiveState> = {}): ContinuationDirectiveState {
  return {
    planName: "PLAN-NAME",
    planPath: "/repo/.omo/plans/PLAN-NAME.md",
    boulderPath: "/repo/.omo/boulder.json",
    checklist: checklist(),
    worktreePath: null,
    ledgerPath: "/repo/.omo/ulw-execute/ledger.jsonl",
    sessionId: "ses_test123",
    ...overrides,
  }
}

describe("renderDirective", () => {
  it("substitutes every placeholder and leaves no template token", () => {
    const rendered = renderDirective(state())

    expect(rendered).not.toContain("{{")
    expect(rendered).toContain("PLAN-NAME")
    expect(rendered).toContain("/repo/.omo/plans/PLAN-NAME.md")
    expect(rendered).toContain("/repo/.omo/boulder.json")
    expect(rendered).toContain("`6` of `9`")
    expect(rendered).toContain("`T4`")
    expect(rendered).toContain("/repo/.omo/ulw-execute/ledger.jsonl")
  })

  it("renders the bare session id under the opencode: prefix from the template", () => {
    const rendered = renderDirective(state({ sessionId: "ses_abc" }))

    expect(rendered).toContain("`opencode:ses_abc`")
    expect(rendered).not.toContain("codex:")
    expect(rendered).not.toContain("senpi:")
  })

  it("renders null nextTaskLabel as the final-gate-pending label", () => {
    const rendered = renderDirective(state({ checklist: checklist({ nextTaskLabel: null }) }))

    expect(rendered).toContain(NEXT_TASK_LABEL_NONE)
    expect(rendered).toContain(`\`${NEXT_TASK_LABEL_NONE}\``)
  })

  it("renders an empty worktree block when there is no worktree", () => {
    const rendered = renderDirective(state({ worktreePath: null }))

    expect(rendered).not.toContain("- Worktree:")
  })

  it("renders the newline-prefixed worktree line when a worktree is set", () => {
    const rendered = renderDirective(state({ worktreePath: "/repo/.worktrees/wt-1" }))

    expect(rendered).toContain(
      "\n- Worktree: `/repo/.worktrees/wt-1` (all edits, tests, and commands run inside this directory)",
    )
  })

  it("renders remaining and total counts as strings from the checklist", () => {
    const rendered = renderDirective(state({ checklist: checklist({ total: 12, completed: 12, remaining: 0 }) }))

    expect(rendered).toContain("`0` of `12`")
  })
})
