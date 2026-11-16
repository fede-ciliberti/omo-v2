/**
 * Request-shaping wiring for the Sisyphus doctrine (plan
 * v2-sisyphus-orchestration-port, todo 3, branch A).
 *
 * The spike (`.omo/evidence/20261116-v2-sisyphus-orchestration-port/
 * task-1-seam-verdict.md`) proved that a `ctx.session.hook("context")` mutation
 * of `input.system` and `input.options` reaches the provider, so the per-model
 * half of the doctrine is applied here instead of being baked statically.
 *
 * Only the Sisyphus agent is touched, and only the allowlisted generation
 * fields are written. Every other agent and every other option is left exactly
 * as the host produced it.
 */

import { FAMILY_OPTIONS, FAMILY_OVERLAYS } from "./family-overlays"
import { resolveModelFamily } from "./model-family"
import { SISYPHUS_DOCTRINE_BASE } from "./sisyphus-doctrine"

/** The only generation fields this module may ever set on `input.options`. */
export const ALLOWED_OPTION_KEYS = ["maxTokens", "temperature", "topP", "topK"] as const

export type SystemPartLike = {
  readonly type: string
  readonly text?: string
}

export type DoctrineHookInput = {
  readonly agent: string
  readonly model: { readonly id: string }
  system: SystemPartLike[]
  options: Record<string, unknown>
}

/** Doctrine body for a model: the base, plus that family's delta when it has one. */
export function composeDoctrine(modelId: string): string {
  const overlay = FAMILY_OVERLAYS[resolveModelFamily(modelId)] ?? ""
  return overlay.length === 0 ? SISYPHUS_DOCTRINE_BASE : `${SISYPHUS_DOCTRINE_BASE}\n\n${overlay}`
}

function isDoctrinePart(part: SystemPartLike): boolean {
  return part.type === "text" && typeof part.text === "string" && part.text.startsWith(SISYPHUS_DOCTRINE_BASE)
}

/**
 * Apply the Sisyphus doctrine to one outbound request.
 *
 * The static `agent.system` already carries `SISYPHUS_DOCTRINE_BASE`, so the
 * matching part is REPLACED rather than appended: a request never carries two
 * copies of the doctrine. When the host produced no doctrine part, the composed
 * body is appended once.
 */
export function applySisyphusDoctrine(input: DoctrineHookInput): void {
  if (input.agent !== "sisyphus") return

  const body = composeDoctrine(input.model.id)
  const index = input.system.findIndex(isDoctrinePart)
  if (index >= 0) {
    input.system[index] = { ...input.system[index], text: body }
  } else {
    input.system.push({ type: "text", text: body })
  }

  const tuning = FAMILY_OPTIONS[resolveModelFamily(input.model.id)] ?? {}
  for (const key of ALLOWED_OPTION_KEYS) {
    const value = tuning[key]
    if (value !== undefined) input.options[key] = value
  }
}
