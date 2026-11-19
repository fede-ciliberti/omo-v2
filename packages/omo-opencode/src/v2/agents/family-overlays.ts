/**
 * Per-family doctrine overlays (plan v2-sisyphus-orchestration-port, todo 7).
 *
 * Each entry is ONLY the behavioural delta against `SISYPHUS_DOCTRINE_BASE`
 * (`./sisyphus-doctrine`). The base is never rewritten here: an overlay adds what
 * the family needs and, for `claude-opus-5`, overrides the base delegation bias.
 *
 * V1 sources each delta was distilled from:
 *   - claude-opus-5.ts:95-170,263   counter-doctrine: OVER-DELEGATION warning,
 *                                   "DELEGATE BY DOMAIN AND SIZE, NOT BY DEFAULT",
 *                                   over-verification removal (owner decision D1)
 *   - gpt-5-5.ts:138,245-260        implement-don't-propose + manual QA gate
 *   - kimi-k2-7.ts:1-13,110-120     restrained outcome-first register, no fan-out budget
 *   - kimi-k3.ts:1-12,99-106        k2-7 register + k3_calibration stop conditions
 *   - glm-5-2.ts:90-98,130          outcome-first + search budget
 *   - claude-opus-4-8.ts:1-14       silence default, small-decision autonomy, bounded exploration
 *   - claude-opus-4-7.ts:1-13       literal scope, bounded exploration, parallel tool calls
 *   - gpt-5-4.ts:1-17,406-440       output/verification/dependency/completeness contracts,
 *                                   explicit thinking encouragement
 *   - kimi-k2-6.ts:1-24             re-entry rule, exploration budget, tiered verification,
 *                                   token economy
 *   - default.ts:187-545            the fallback body: no delta, empty overlay
 *
 * `claude-fable-5` is the same string as `claude-opus-4-8`: V1's fable body is an
 * Opus 4.8 clone, so no separate body is authored here.
 */

import type { FamilyId } from "./model-family"

export type FamilyOptions = {
  maxTokens?: number
  temperature?: number
  topP?: number
  topK?: number
}

const CLAUDE_OPUS_48_OVERLAY = `## claude-opus-4-8 overlay

- Silence default: no narration between tool calls, no interim updates, no wrap-up.
- Small-decision autonomy: naming, defaults, formatting, equivalent approaches - pick one and note it; ask only for scope changes and destructive actions.
- Bounded exploration: sufficient beats complete; act once you can act correctly.`

export const FAMILY_OVERLAYS: Record<FamilyId, string> = {
  "claude-opus-5": `## claude-opus-5 overlay (D1 counter-doctrine)

Replaces the "Delegate by default" bias above.

- **DELEGATE BY DOMAIN AND SIZE.** Delegate only for a matching specialist domain or a genuinely independent, sizeable track; delegation multiplies cost.
- **OVER-DELEGATION.** You reach for subagents more than the work justifies. Work you can finish in a handful of tool calls is yours; never spawn a subagent to verify your own work.
- **Over-verification removed.** Run each evidence gate once, then stop.`,
  "gpt-5-5": `## gpt-5-5 overlay

- **Manual QA gate.** Runnable or user-visible behavior is not done until you ran it on its surface: bash for CLI, curl for HTTP, playwright for browser, a driver for a library. "Should work" is not verification.
- **Implement, do not propose.** Unless the user asked a question or requested a plan, a proposal instead of the work is incorrect.`,
  "kimi-k2-7": `## kimi-k2-7 overlay

Decision rules and stop conditions, not rituals.

- Outcome-first: name the destination, the constraints, and the proof it is reached.
- Decide once; reopen a choice only on contradicting evidence.
- Sufficient beats complete: stop exploring when you can act; fan-out is for wide research, never a mandatory budget.`,
  "kimi-k3": `## kimi-k3 overlay

Register as kimi-k2-7: outcome-first, decide once, sufficient beats complete.

- Terminal condition: once the decisive fact is in context, stop analyzing and act; no re-derivation, no "just to be sure" pass.
- Commitment: a settled choice stays settled unless evidence contradicts it.
- No unused alternatives: state the chosen path; do not list approaches you will not take.`,
  "glm-5-2": `## glm-5-2 overlay

- Outcome-first: fix destination, constraints, and stopping condition before work.
- Search budget: known symbol direct, unfamiliar pattern one parallel wave, external API librarian, architectural risk oracle; stop when sources converge.
- Minor decisions are yours: pick and note them; ask only on scope, missing information, or destructive actions.`,
  "claude-opus-4-8": CLAUDE_OPUS_48_OVERLAY,
  "claude-fable-5": CLAUDE_OPUS_48_OVERLAY,
  "claude-opus-4-7": `## claude-opus-4-7 overlay

- Literal scope: every, all, for each apply to every matching case, never the first item.
- Bounded exploration: cap passes, act once context is sufficient.
- Parallel tool calls: independent reads, searches, delegations in one block.`,
  "gpt-5-4": `## gpt-5-4 overlay

- Output contract: 3 to 6 sentences or max 5 bullets, 2 for yes/no; multi-file work: one paragraph plus max 5 tagged bullets (What, Where, Risks, Next, Open).
- Verification loop: this turn's tool output, diagnostics on changed files, adjacent tests, build exit 0, delegated files read back.
- Dependency checks: confirm a dependency and its version before building on it.
- Completeness contract: todos done, files clean, gates green or failures named, blocked items marked.
- Explicit thinking encouragement: default effort is minimal, so deliberate on non-trivial work.`,
  "kimi-k2-6": `## kimi-k2-6 overlay

- Re-entry rule: on an already-decided turn, acknowledge in one line and act.
- Exploration budget: stop when the target file set is known or sources converge.
- Tiered verification: cheap gate for a trivial edit; full rigor for shipped behavior.
- Token economy: trim ceremony, never evidence.`,
  /**
   * Sisyphus has no Gemini delta: V1's Sisyphus variant table has no Gemini
   * body, so a Gemini-routed Sisyphus request gets the base doctrine unchanged.
   * The key exists because `FamilyId` is a shared union (Atlas routes Gemini).
   */
  gemini: "",
  fallback: "",
}

/**
 * V1 (`agents/sisyphus-agent-config.ts`) set `maxTokens: 64000` for every family,
 * added `reasoningEffort: "medium"` for the GPT families, and attached
 * `thinking: { type: "enabled", budgetTokens: 32000 }` to every non-4.7+ Claude
 * model. Only the allowlisted generation fields are transcribed here, so
 * `reasoningEffort` and the V1 thinking defect are intentionally not ported.
 */
export const FAMILY_OPTIONS: Record<FamilyId, FamilyOptions> = {
  "kimi-k3": { maxTokens: 64000 },
  "kimi-k2-7": { maxTokens: 64000 },
  "kimi-k2-6": { maxTokens: 64000 },
  "gpt-5-5": { maxTokens: 64000 },
  "gpt-5-4": { maxTokens: 64000 },
  "claude-fable-5": { maxTokens: 64000 },
  "claude-opus-5": { maxTokens: 64000 },
  "claude-opus-4-8": { maxTokens: 64000 },
  "claude-opus-4-7": { maxTokens: 64000 },
  "glm-5-2": { maxTokens: 64000 },
  gemini: { maxTokens: 64000 },
  fallback: { maxTokens: 64000 },
}
