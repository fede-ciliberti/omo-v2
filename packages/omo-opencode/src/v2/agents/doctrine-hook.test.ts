import { describe, expect, test } from "bun:test"
import { ATLAS_DOCTRINE_BASE } from "./atlas-doctrine"
import { ATLAS_FAMILY_OPTIONS, ATLAS_FAMILY_OVERLAYS } from "./atlas-family-overlays"
import {
  ALLOWED_OPTION_KEYS,
  applyAgentDoctrine,
  applySisyphusDoctrine,
  composeDoctrine,
  REGISTRY,
} from "./doctrine-hook"
import { FAMILY_OVERLAYS, FAMILY_OPTIONS } from "./family-overlays"
import { FAMILY_IDS, resolveModelFamily } from "./model-family"
import { SISYPHUS_DOCTRINE_BASE } from "./sisyphus-doctrine"

const EXPECTED_OPTION_KEYS = ["maxTokens", "temperature", "topP", "topK"]

/** One model id per family, same representatives the resolver test uses. */
const REPRESENTATIVE: Record<string, string> = {
  "kimi-k3": "moonshot/kimi-k3",
  "kimi-k2-7": "moonshot/kimi-k2-7",
  "kimi-k2-6": "moonshot/kimi-k2.5",
  "gpt-5-5": "openai/gpt-5.5",
  "gpt-5-4": "openai/gpt-5.4",
  "claude-fable-5": "anthropic/claude-fable-5",
  "claude-opus-5": "anthropic/claude-opus-5",
  "claude-opus-4-8": "anthropic/claude-opus-4.8",
  "claude-opus-4-7": "anthropic/claude-opus-4.7",
  "glm-5-2": "zhipu/glm-5.2",
  gemini: "google/gemini-3-pro",
  fallback: "vllm/deepseek-v4.1-flash-pool",
}

type Request = {
  agent: string
  model: { id: string }
  system: Array<{ type: string; text?: string; cache?: unknown }>
  options: Record<string, unknown>
}

function request(agent: string, modelId: string): Request {
  return {
    agent,
    model: { id: modelId },
    system: [{ type: "text", text: SISYPHUS_DOCTRINE_BASE }],
    options: {},
  }
}

function sisyphusExpected(modelId: string): string {
  const overlay = FAMILY_OVERLAYS[resolveModelFamily(modelId)] ?? ""
  return overlay.length === 0 ? SISYPHUS_DOCTRINE_BASE : `${SISYPHUS_DOCTRINE_BASE}\n\n${overlay}`
}

function atlasExpected(modelId: string): string {
  const overlay = ATLAS_FAMILY_OVERLAYS[resolveModelFamily(modelId)] ?? ""
  return overlay.length === 0 ? ATLAS_DOCTRINE_BASE : `${ATLAS_DOCTRINE_BASE}\n\n${overlay}`
}

function allowlisted(options: Record<string, unknown>): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of ALLOWED_OPTION_KEYS) {
    if (options[key] !== undefined) picked[key] = options[key]
  }
  return picked
}

describe("doctrine registry", () => {
  test("#given the registry #when read #then it covers sisyphus and atlas and nothing else", () => {
    // given / when
    const ids = Object.keys(REGISTRY).sort()

    // then
    expect(ids).toEqual(["atlas", "sisyphus"])
    for (const id of ids) {
      const entry = REGISTRY[id]
      expect(typeof entry?.base).toBe("string")
      expect(typeof entry?.compose).toBe("function")
    }
  })

  test("#given the registry #when the allowlist is read #then it is unchanged", () => {
    // given / when / then
    expect([...ALLOWED_OPTION_KEYS]).toEqual(EXPECTED_OPTION_KEYS)
  })

  test("#given every family #when the sisyphus doctrine is composed #then it is base plus that family's overlay", () => {
    for (const family of FAMILY_IDS) {
      // given
      const modelId = REPRESENTATIVE[family]
      expect(resolveModelFamily(modelId)).toBe(family)

      // when
      const composed = composeDoctrine(modelId)

      // then
      expect(composed).toBe(sisyphusExpected(modelId))
      expect(REGISTRY.sisyphus?.compose(modelId)).toBe(composed)
    }
  })

  test("#given every family #when a sisyphus request is applied #then the system part and options match the recorded composition", () => {
    for (const family of FAMILY_IDS) {
      // given
      const modelId = REPRESENTATIVE[family]
      const input = request("sisyphus", modelId)

      // when
      applySisyphusDoctrine(input)

      // then
      expect(input.system).toHaveLength(1)
      expect(input.system[0]?.text).toBe(sisyphusExpected(modelId))
      expect(input.options).toEqual(allowlisted(FAMILY_OPTIONS[family]))
    }
  })

  test("#given every family #when an atlas request is applied #then the atlas part is base plus that family's overlay", () => {
    for (const family of FAMILY_IDS) {
      // given
      const modelId = REPRESENTATIVE[family]
      const input: Request = {
        agent: "atlas",
        model: { id: modelId },
        system: [{ type: "text", text: ATLAS_DOCTRINE_BASE }],
        options: {},
      }

      // when
      applyAgentDoctrine(input)

      // then
      expect(input.system).toHaveLength(1)
      expect(input.system[0]?.text).toBe(atlasExpected(modelId))
      expect(REGISTRY.atlas?.compose(modelId)).toBe(atlasExpected(modelId))
    }
  })

  test("#given an atlas request #when applied #then only the temperature option is written", () => {
    // given
    const input: Request = {
      agent: "atlas",
      model: { id: "google/gemini-3-pro" },
      system: [{ type: "text", text: ATLAS_DOCTRINE_BASE }],
      options: { hostKey: "host-value" },
    }

    // when
    applyAgentDoctrine(input)

    // then
    expect(input.options).toEqual({ hostKey: "host-value", temperature: 0.1 })
    expect(ATLAS_FAMILY_OPTIONS.gemini).toEqual({ temperature: 0.1 })
  })

  test("#given an atlas request with no doctrine part #when applied #then the atlas body is appended exactly once", () => {
    // given
    const input: Request = {
      agent: "atlas",
      model: { id: "anthropic/claude-opus-5" },
      system: [{ type: "text", text: "host system prompt" }],
      options: {},
    }

    // when
    applyAgentDoctrine(input)

    // then
    expect(input.system).toHaveLength(2)
    expect(input.system[0]?.text).toBe("host system prompt")
    expect(input.system[1]?.text).toBe(ATLAS_DOCTRINE_BASE)
  })

  test("#given an atlas request #when the sisyphus-only entry point runs #then nothing is touched", () => {
    // given
    const input: Request = {
      agent: "atlas",
      model: { id: "anthropic/claude-opus-4.8" },
      system: [{ type: "text", text: ATLAS_DOCTRINE_BASE }],
      options: {},
    }
    const systemBefore = JSON.stringify(input.system)

    // when
    applySisyphusDoctrine(input)

    // then
    expect(JSON.stringify(input.system)).toBe(systemBefore)
    expect(Object.keys(input.options)).toHaveLength(0)
  })
})

describe("applySisyphusDoctrine", () => {
  test("#given a sisyphus request for an overlay family #when applied #then one doctrine part carries base+overlay", () => {
    // given
    const input = request("sisyphus", "anthropic/claude-opus-4-8")

    // when
    applySisyphusDoctrine(input)

    // then
    const doctrineParts = input.system.filter((part) => part.text?.startsWith(SISYPHUS_DOCTRINE_BASE))
    expect(doctrineParts).toHaveLength(1)
    expect(doctrineParts[0]?.text).toBe(composeDoctrine("anthropic/claude-opus-4-8"))
    expect(doctrineParts[0]?.text).toBe(`${SISYPHUS_DOCTRINE_BASE}\n\n${FAMILY_OVERLAYS["claude-opus-4-8"]}`)
  })

  test("#given a sisyphus request #when applied #then options gain only allowlisted keys", () => {
    // given
    const input = request("sisyphus", "anthropic/claude-opus-4-8")
    input.options = { temperature: 0.5 }

    // when
    applySisyphusDoctrine(input)

    // then
    for (const key of Object.keys(input.options)) {
      expect(EXPECTED_OPTION_KEYS).toContain(key)
    }
    expect(input.options.temperature).toBe(0.5)
  })

  test("#given a fallback-family model #when applied #then the doctrine is the base with no overlay tail", () => {
    // given
    const input = request("sisyphus", "vllm/deepseek-v4.1-flash-pool")

    // when
    applySisyphusDoctrine(input)

    // then
    expect(FAMILY_OVERLAYS.fallback).toBe("")
    expect(input.system[0]?.text).toBe(SISYPHUS_DOCTRINE_BASE)
  })

  test("#given a request with no doctrine part #when applied #then exactly one part is appended", () => {
    // given
    const input = request("sisyphus", "anthropic/claude-opus-4-8")
    input.system = [{ type: "text", text: "host system prompt" }]

    // when
    applySisyphusDoctrine(input)

    // then
    expect(input.system).toHaveLength(2)
    expect(input.system[0]?.text).toBe("host system prompt")
    expect(input.system[1]?.text).toBe(composeDoctrine("anthropic/claude-opus-4-8"))
  })

  test("#given another agent #when applied #then system and options are untouched", () => {
    // given
    const input = request("oracle", "anthropic/claude-opus-4-8")
    const systemBefore = JSON.stringify(input.system)

    // when
    applySisyphusDoctrine(input)

    // then
    expect(JSON.stringify(input.system)).toBe(systemBefore)
    expect(Object.keys(input.options)).toHaveLength(0)
  })
})

describe("applyAgentDoctrine", () => {
  test("#given an unregistered agent #when applied #then zero system parts are touched and options are unchanged", () => {
    // given
    const input: Request = {
      agent: "oracle",
      model: { id: "anthropic/claude-opus-4-8" },
      system: [{ type: "text", text: "oracle prompt" }],
      options: { temperature: 0.9 },
    }
    const systemBefore = JSON.stringify(input.system)

    // when
    applyAgentDoctrine(input)

    // then
    expect(JSON.stringify(input.system)).toBe(systemBefore)
    expect(input.options).toEqual({ temperature: 0.9 })
  })
})
