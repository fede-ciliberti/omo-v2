/**
 * Per-family doctrine overlays for Atlas (plan v2-atlas-orchestration-port, todo 3).
 *
 * Each entry is ONLY the behavioural delta against `ATLAS_DOCTRINE_BASE`
 * (`./atlas-doctrine`), which carries the shared orchestration doctrine. The
 * overlays are distilled from the V1 Atlas bodies under
 * `packages/prompts-core/prompts/atlas/`, with the dead V1 primitives (`task(`,
 * `task_id`, `load_skills`) spoken in the V2 vocabulary (`subagent`, `sessionID`,
 * `todowrite`). The prose volume of the V1 bank is deliberately not ported: the
 * base plus every overlay must stay within 12,000 characters.
 *
 * V1 sources each delta was distilled from:
 *   - gpt.md <gpt_family_calibration>                     outcome-first + four hard invariants
 *   - gemini.md <TOOL_CALL_MANDATE>, <gemini_parallel_addendum>,
 *     <scope_and_design_constraints>                      tool-call mandate, N tasks = N calls
 *   - kimi.md <kimi_parallel_addendum>                    low-entropy parallel decision
 *   - kimi-k2-7.md <role>                                 restrained, outcome-first register
 *   - kimi-k3.md <role>                                   the k2-7 register, 4 lines apart
 *   - opus-4-7.md <opus_47_counter_defaults> :10-16 and
 *     <opus_47_parallel_addendum> :211-217                literal following + fan-out push
 *   - glm.md <role> :1 and <glm_52_calibration> :15-52    state preservation, checkbox ownership
 *   - default.md                                          the fallback body: no delta
 *
 * `claude-fable-5`, `claude-opus-5` and `claude-opus-4-8` have no Atlas-specific
 * delta in V1 beyond the shared `default.md` body, so they carry an empty overlay.
 */

import type { FamilyId } from "./model-family"

/** The only generation field Atlas sets, per the V1 `createAtlasAgent`. */
export type AtlasFamilyOptions = {
  temperature?: number
}

const KIMI_K2_7_OVERLAY = `## kimi-k2-7

- Outcome-first: name the destination, the constraints, the proof.
- Mechanical calls are decided, not debated: parallel unless a blocker is NAMED; tick the box, run the gate.
- Depth goes to what changes the outcome: verifying a result, diagnosing a failure.
- Never enumerate orderings or re-open a settled dispatch.`

const GPT_5_5_OVERLAY = `## gpt-5-5

Outcome-first: skip a step only when demonstrably unnecessary, never the hard invariants:

1. Parallel fan-out by default: one response, multiple \`subagent\` calls.
2. After EVERY delegation: read the changed files, run \`lsp.diagnostics\` and the tests.
3. After EVERY verified completion: tick \`- [ ]\` to \`- [x]\` BEFORE the next dispatch.
4. A failure resumes the same child session via \`sessionID\`; never start fresh.

Stopping condition: every top-level checkbox is \`- [x]\` AND every Final Wave reviewer APPROVES.`

const OPUS_4_7_OVERLAY = `## claude-opus-4-7

1. LITERAL FOLLOWING. "Every task", "all batches", "for each item" cover EVERY case: never "first item only", never a silent scope-down.
2. FEWER SUBAGENTS BY DEFAULT. N independent tasks means N \`subagent\` calls in ONE message, not N/2 then N/2: dispatching 1 of 4 means dispatch all 4 now.`

const GLM_5_2_OVERLAY = `## glm-5-2

Role: you hold the workflow upright, deciding each next dispatch.

- Literal following: "every", "all", "after each" cover EVERY matching case.
- State preservation: read the plan and the collected results before dispatching; carry them into the next brief.
- Checkbox ownership: tick the box after every verified completion, before the next dispatch.`

const GEMINI_OVERLAY = `## gemini

**Tool-call mandate.** Zero tool calls is a failed response.

1. NEVER claim verification without the call that produced it.
2. NEVER state what a changed file probably looks like, nor assume \`lsp.diagnostics\` passes: read the file, run the diagnostic.
3. NEVER assume a delegation is done: collect the result and read the changed files.

**Parallel addendum.** 3 parallel tasks means 3 \`subagent\` calls.

**Scope.** Exactly what the plan says: no scope creep; ambiguity takes the simplest reading or a question.`

export const ATLAS_FAMILY_OVERLAYS: Record<FamilyId, string> = {
  "kimi-k3": KIMI_K2_7_OVERLAY,
  "kimi-k2-7": KIMI_K2_7_OVERLAY,
  "kimi-k2-6": `## kimi-k2-6

- Parallel versus sequential is low-entropy: either a blocker is NAMED or it is not. Decide once per batch; re-open only on real evidence (file conflict, input dependency).
- Weighing "approach 1 / approach 2" means pick the obvious one and fan out.`,
  "gpt-5-5": GPT_5_5_OVERLAY,
  "gpt-5-4": GPT_5_5_OVERLAY,
  "claude-fable-5": "",
  "claude-opus-5": "",
  "claude-opus-4-8": "",
  "claude-opus-4-7": OPUS_4_7_OVERLAY,
  "glm-5-2": GLM_5_2_OVERLAY,
  gemini: GEMINI_OVERLAY,
  fallback: "",
}

/**
 * Atlas runs at temperature 0.1 in V1 (`createAtlasAgent`). Nothing else is set:
 * no `maxTokens`, and no thinking/reasoning object (the V1 `thinking: 32000`
 * attachment was a defect, not behaviour worth porting).
 */
export const ATLAS_FAMILY_OPTIONS: Record<FamilyId, AtlasFamilyOptions> = {
  "kimi-k3": { temperature: 0.1 },
  "kimi-k2-7": { temperature: 0.1 },
  "kimi-k2-6": { temperature: 0.1 },
  "gpt-5-5": { temperature: 0.1 },
  "gpt-5-4": { temperature: 0.1 },
  "claude-fable-5": { temperature: 0.1 },
  "claude-opus-5": { temperature: 0.1 },
  "claude-opus-4-8": { temperature: 0.1 },
  "claude-opus-4-7": { temperature: 0.1 },
  "glm-5-2": { temperature: 0.1 },
  gemini: { temperature: 0.1 },
  fallback: { temperature: 0.1 },
}
