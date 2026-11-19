/**
 * Model-family routing for the agent doctrines (plan v2-sisyphus-orchestration-port,
 * todo 6; the `gemini` family was added by plan v2-atlas-orchestration-port, todo 3).
 *
 * The precedence chain is transcribed line for line from V1 so the two lines never
 * disagree about which overlay a model gets. V1 sources:
 *   - agents/sisyphus-agent-factory.ts:62-74      (resolveSisyphusPromptFamily)
 *   - packages/model-core/src/model-family-detectors.ts:1-3,11-94 (predicates + normalisation)
 *   - packages/model-core/src/provider-model-id-transform.ts:58-61 (kimi-for-coding alias)
 *   - agents/types.ts:131-145                     (GPT native / 5.5 / 5.6 predicates)
 *
 * This module is deliberately self-contained: the V2 plugin does not import
 * `@oh-my-opencode/model-core` at runtime.
 */

export type FamilyId =
  | "kimi-k3"
  | "kimi-k2-7"
  | "kimi-k2-6"
  | "gpt-5-5"
  | "gpt-5-4"
  | "claude-fable-5"
  | "claude-opus-5"
  | "claude-opus-4-8"
  | "claude-opus-4-7"
  | "glm-5-2"
  | "gemini"
  | "fallback"

export const FAMILY_IDS = [
  "kimi-k3",
  "kimi-k2-7",
  "kimi-k2-6",
  "gpt-5-5",
  "gpt-5-4",
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "glm-5-2",
  "gemini",
  "fallback",
] as const satisfies readonly FamilyId[]

/**
 * `kimi-for-coding` is the Kimi product id, and this plan routes it to `kimi-k3`
 * (todo 6 acceptance in `.omo/plans/v2-sisyphus-orchestration-port.md`).
 *
 * Known discrepancy, recorded rather than hidden: V1's own router would reach
 * `kimi-k2-6` for this literal id, because none of `isKimiK3Model`'s predicates
 * match it and `isKimiK2Model` accepts any name containing "kimi"
 * (`omo-v1/dev:packages/model-core/src/model-family-detectors.ts:79-84,65-70`).
 * `provider-model-id-transform.ts:58-61` is the opposite direction: under the
 * `kimi-coding` / `kimi-for-coding` providers it rewrites the model string
 * `kimi-k3` to `k3`, which does not establish a k3 family for this id.
 * The alias is kept because the approved plan names it; changing it is a
 * doctrine decision, not a mechanical fix.
 */
const KIMI_CODING_ALIASES: Record<string, string> = {
  "kimi-for-coding": "kimi-k3",
}

const GPT_NATIVE_RE = /gpt-5[.-](?:(?:3[.-])?codex|[4-9]|\d{2,})/

/** Last path segment, lowercased. Provider prefixes never select a family. */
function extractModelName(modelId: string): string {
  const segment = modelId.includes("/") ? (modelId.split("/").pop() ?? modelId) : modelId
  const name = segment.toLowerCase()
  return KIMI_CODING_ALIASES[name] ?? name
}

/** Claude ids are compared with dots folded to dashes (`4.8` and `4-8` are one family). */
function claudeName(name: string): string {
  return name.replaceAll(".", "-")
}

function isKimiK3(name: string): boolean {
  return /kimi-k3/.test(name) || /k3[-.]?p?\d*$/.test(name)
}

function isKimiK27(name: string): boolean {
  return /kimi-k2[.\-]?7/.test(name) || /k2[-.]?p7/.test(name)
}

function isKimi(name: string): boolean {
  return name.includes("kimi") || /k2[-.]?p[567]/.test(name)
}

function isGpt55(name: string): boolean {
  return name.includes("gpt-5.5") || name.includes("gpt-5-5")
}

function isGpt56(name: string): boolean {
  return name.includes("gpt-5.6") || name.includes("gpt-5-6")
}

function isGptNative(name: string): boolean {
  return GPT_NATIVE_RE.test(name)
}

/**
 * Gemini family. V1's Atlas variant table checks Gemini BEFORE any Kimi
 * variant (`packages/prompts-core/src/atlas-prompts.ts:11-26`; the same order
 * documented in `omo-v1/dev:packages/omo-opencode/src/agents/atlas/agent.ts:1-15`),
 * so this branch is placed first among the family branches. The predicate is
 * narrow - a `gemini` substring on the normalised last segment - so no provider
 * model id in use today matches it together with a kimi, gpt, claude or glm id;
 * a synthetic id containing both tokens would resolve to gemini, which is why
 * the branch sits first.
 */
function isGemini(name: string): boolean {
  return name.includes("gemini")
}

export function resolveModelFamily(modelId: string): FamilyId {
  const name = extractModelName(modelId)
  const claude = claudeName(name)

  if (isGemini(name)) return "gemini"
  if (isKimiK3(name)) return "kimi-k3"
  if (isKimiK27(name)) return "kimi-k2-7"
  if (isKimi(name)) return "kimi-k2-6"
  if (isGpt55(name) || isGpt56(name)) return "gpt-5-5"
  if (isGptNative(name)) return "gpt-5-4"
  if (claude.includes("claude-fable-5")) return "claude-fable-5"
  if (claude.includes("claude-opus-5")) return "claude-opus-5"
  if (claude.includes("claude-opus-4-8")) return "claude-opus-4-8"
  if (claude.includes("claude-opus-4-7")) return "claude-opus-4-7"
  if (name.includes("glm")) return "glm-5-2"
  return "fallback"
}
