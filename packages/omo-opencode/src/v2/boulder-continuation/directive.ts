/**
 * [OMC] v2 boulder-continuation directive render (task 7).
 *
 * Renders the continuation directive from the template in
 * `./directive-template.ts`, substituting each `{{PLACEHOLDER}}` with
 * `replaceAll` per DIRECTIVE.md section 1.1. The `opencode:` session prefix
 * lives in the template text, so the `sessionId` value stays bare and the
 * render never composes a prefix for another harness.
 */

import type { PlanChecklist } from "@oh-my-opencode/boulder-state"
import { CONTINUATION_DIRECTIVE_TEMPLATE } from "./directive-template"

/** Everything the directive needs for one work, per DIRECTIVE.md section 1.1. */
export interface ContinuationDirectiveState {
  /** Work plan name. */
  readonly planName: string
  /** Absolute or repo-relative path of the plan file. */
  readonly planPath: string
  /** Path of `.omo/boulder.json`. */
  readonly boulderPath: string
  /** Plan checklist counts; `nextTaskLabel` may be null when nothing remains. */
  readonly checklist: PlanChecklist
  /** Worktree path, or null when the work has none. */
  readonly worktreePath: string | null
  /** Path of the work ledger. */
  readonly ledgerPath: string
  /** Bare session id of the current turn (the template adds `opencode:`). */
  readonly sessionId: string
}

/** DIRECTIVE.md section 1.1: rendered when `nextTaskLabel` is null. */
export const NEXT_TASK_LABEL_NONE = "none (final gate pending)"

function worktreeBlock(worktreePath: string | null): string {
  if (worktreePath === null) {
    return ""
  }
  return `\n- Worktree: \`${worktreePath}\` (all edits, tests, and commands run inside this directory)`
}

/** Substitute every placeholder in the template with its value. */
export function renderDirective(state: ContinuationDirectiveState): string {
  const replacements: Record<string, string> = {
    PLAN_NAME: state.planName,
    PLAN_PATH: state.planPath,
    BOULDER_PATH: state.boulderPath,
    REMAINING_COUNT: String(state.checklist.remaining),
    TOTAL_COUNT: String(state.checklist.total),
    NEXT_TASK_LABEL: state.checklist.nextTaskLabel ?? NEXT_TASK_LABEL_NONE,
    WORKTREE_BLOCK: worktreeBlock(state.worktreePath),
    LEDGER_PATH: state.ledgerPath,
    SESSION_ID: state.sessionId,
  }

  let rendered = CONTINUATION_DIRECTIVE_TEMPLATE
  for (const [placeholder, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${placeholder}}}`, value)
  }
  return rendered
}
