/**
 * Request-shaping wiring for the agent doctrines (plan v2-atlas-orchestration-port,
 * todo 4; originally the Sisyphus-only hook from plan v2-sisyphus-orchestration-port,
 * todo 3, branch A).
 *
 * The spike (`.omo/evidence/20261116-v2-sisyphus-orchestration-port/
 * task-1-seam-verdict.md`) proved that a `ctx.session.hook("context")` mutation
 * of `input.system` and `input.options` reaches the provider, so the per-model
 * half of a doctrine is applied here instead of being baked statically.
 *
 * One registry entry per agent. An entry carries its own base body, its own
 * family overlays and its own generation options, plus the shared composition
 * from `createAgentDoctrine`. Only the registered agents are touched, and only
 * the allowlisted generation fields are written. Every other agent and every
 * other option is left exactly as the host produced it.
 */

import { ATLAS_DOCTRINE_BASE } from "./atlas-doctrine"
import { ATLAS_FAMILY_OPTIONS, ATLAS_FAMILY_OVERLAYS } from "./atlas-family-overlays"
import { FAMILY_OPTIONS, FAMILY_OVERLAYS } from "./family-overlays"
import type { FamilyId } from "./model-family"
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

/** The allowlisted generation fields an agent doctrine may write. */
export type AgentDoctrineOptions = Partial<Record<(typeof ALLOWED_OPTION_KEYS)[number], number>>

/** One agent's doctrine: its base body, its family deltas and its tuning. */
export type AgentDoctrine = {
  readonly base: string
  readonly overlays: Record<FamilyId, string>
  readonly options: Record<FamilyId, AgentDoctrineOptions>
  compose(modelId: string): string
}

/**
 * Doctrine body for a model: the base, plus that family's delta when it has one.
 * This is the single composition path shared by every registry entry.
 */
function compose(base: string, overlays: Record<FamilyId, string>, modelId: string): string {
  const overlay = overlays[resolveModelFamily(modelId)] ?? ""
  return overlay.length === 0 ? base : `${base}\n\n${overlay}`
}

function createAgentDoctrine(
  base: string,
  overlays: Record<FamilyId, string>,
  options: Record<FamilyId, AgentDoctrineOptions>,
): AgentDoctrine {
  return {
    base,
    overlays,
    options,
    compose: (modelId) => compose(base, overlays, modelId),
  }
}

const SISYPHUS_DOCTRINE: AgentDoctrine = createAgentDoctrine(
  SISYPHUS_DOCTRINE_BASE,
  FAMILY_OVERLAYS,
  FAMILY_OPTIONS,
)

const ATLAS_DOCTRINE: AgentDoctrine = createAgentDoctrine(
  ATLAS_DOCTRINE_BASE,
  ATLAS_FAMILY_OVERLAYS,
  ATLAS_FAMILY_OPTIONS,
)

/** Agent id to doctrine. An id absent from this map is never shaped. */
export const REGISTRY: Readonly<Partial<Record<string, AgentDoctrine>>> = {
  sisyphus: SISYPHUS_DOCTRINE,
  atlas: ATLAS_DOCTRINE,
}

/** Sisyphus doctrine body for a model: the base, plus that family's delta. */
export function composeDoctrine(modelId: string): string {
  return SISYPHUS_DOCTRINE.compose(modelId)
}

function isDoctrinePart(part: SystemPartLike, base: string): boolean {
  return part.type === "text" && typeof part.text === "string" && part.text.startsWith(base)
}

function applyDoctrine(input: DoctrineHookInput, doctrine: AgentDoctrine): void {
  const body = doctrine.compose(input.model.id)
  const index = input.system.findIndex((part) => isDoctrinePart(part, doctrine.base))
  if (index >= 0) {
    input.system[index] = { ...input.system[index], text: body }
  } else {
    input.system.push({ type: "text", text: body })
  }

  const tuning = doctrine.options[resolveModelFamily(input.model.id)] ?? {}
  for (const key of ALLOWED_OPTION_KEYS) {
    const value = tuning[key]
    if (value !== undefined) input.options[key] = value
  }
}

/**
 * Apply the registered doctrine of `input.agent` to one outbound request.
 *
 * The static `agent.system` already carries the entry's base, so the matching
 * part is REPLACED rather than appended: a request never carries two copies of
 * the doctrine. When the host produced no doctrine part, the composed body is
 * appended once. An unregistered agent is left untouched.
 */
export function applyAgentDoctrine(input: DoctrineHookInput): void {
  const doctrine = REGISTRY[input.agent]
  if (doctrine === undefined) return
  applyDoctrine(input, doctrine)
}

/** Apply the Sisyphus doctrine to one outbound request. */
export function applySisyphusDoctrine(input: DoctrineHookInput): void {
  if (input.agent !== "sisyphus") return
  applyDoctrine(input, SISYPHUS_DOCTRINE)
}
