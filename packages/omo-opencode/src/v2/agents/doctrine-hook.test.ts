import { describe, expect, test } from "bun:test"
import { ALLOWED_OPTION_KEYS, applySisyphusDoctrine, composeDoctrine } from "./doctrine-hook"
import { FAMILY_OVERLAYS } from "./family-overlays"
import { SISYPHUS_DOCTRINE_BASE } from "./sisyphus-doctrine"

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
      expect(ALLOWED_OPTION_KEYS).toContain(key as (typeof ALLOWED_OPTION_KEYS)[number])
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
