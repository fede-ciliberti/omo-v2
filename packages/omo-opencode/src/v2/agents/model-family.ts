/**
 * Model-family routing for the Sisyphus doctrine (plan v2-sisyphus-orchestration-port,
 * todo 6).
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
  "fallback",
] as const satisfies readonly FamilyId[]

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

export function resolveModelFamily(modelId: string): FamilyId {
  const name = extractModelName(modelId)
  const claude = claudeName(name)

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
