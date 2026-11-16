import { describe, expect, test } from "bun:test"
import { FAMILY_IDS, resolveModelFamily } from "./model-family"

describe("resolveModelFamily", () => {
  test("maps representative ids to their family", () => {
    // given one id per family, provider prefix included
    const cases: Array<[string, string]> = [
      ["anthropic/claude-opus-4-8", "claude-opus-4-8"],
      ["anthropic/claude-opus-4.8", "claude-opus-4-8"],
      ["openai/gpt-5.5", "gpt-5-5"],
      ["openai/gpt-5-5", "gpt-5-5"],
      ["moonshot/kimi-k3", "kimi-k3"],
      ["moonshot/kimi-for-coding", "kimi-k3"],
      ["zhipu/glm-5.2", "glm-5-2"],
      ["vllm/deepseek-v4.1-flash-pool", "fallback"],
      ["anthropic/claude-fable-5", "claude-fable-5"],
      ["anthropic/claude-opus-5", "claude-opus-5"],
      ["anthropic/claude-opus-4.7", "claude-opus-4-7"],
      ["openai/gpt-5.4", "gpt-5-4"],
      ["openai/gpt-5.6-sol", "gpt-5-5"],
      ["moonshot/kimi-k2-7", "kimi-k2-7"],
      ["moonshot/kimi-k2.5", "kimi-k2-6"],
    ]

    // when resolved
    const actual = cases.map(([id]) => resolveModelFamily(id))

    // then each id lands on its expected family
    expect(actual).toEqual(cases.map(([, family]) => family))
  })

  test("ignores the provider prefix and accepts a bare model id", () => {
    // given the same model behind different providers
    const prefixed = resolveModelFamily("anthropic/claude-opus-4-7")
    const bare = resolveModelFamily("claude-opus-4-7")
    const otherProvider = resolveModelFamily("some-gateway/claude-opus-4-7")

    // when compared
    // then the family is the model's, not the provider's
    expect(prefixed).toBe("claude-opus-4-7")
    expect(bare).toBe("claude-opus-4-7")
    expect(otherProvider).toBe("claude-opus-4-7")
  })

  test("falls back for ids that match no family", () => {
    // given unknown ids
    const unknown = [
      "vllm/deepseek-v4.1-flash-pool",
      "openai/o3",
      "meta-llama/llama-4",
      "",
    ]

    // when resolved
    const families = unknown.map((id) => resolveModelFamily(id))

    // then every one is the catch-all
    expect(families).toEqual(["fallback", "fallback", "fallback", "fallback"])
  })

  test("kimi-k3 wins over kimi-k2-7", () => {
    // given an id matching both the k3 and the k2.7 predicate
    const id = "moonshot/kimi-k2-7-k3"

    // when resolved
    const family = resolveModelFamily(id)

    // then the earlier predicate wins
    expect(family).toBe("kimi-k3")
  })

  test("kimi-k2-7 wins over the generic kimi fallback", () => {
    // given an id matched by both the k2.7 and the any-kimi predicate
    const id = "moonshot/kimi-k2-7"

    // when resolved
    const family = resolveModelFamily(id)

    // then k2.7 is selected, not k2.6
    expect(family).toBe("kimi-k2-7")
  })

  test("gpt-5.5 wins over the gpt-native family", () => {
    // given an id the native gpt pattern also matches
    const id = "openai/gpt-5.5"

    // when resolved
    const family = resolveModelFamily(id)

    // then the dedicated 5.5 branch wins
    expect(family).toBe("gpt-5-5")
  })

  test("every family id is reachable from at least one model id", () => {
    // given one representative model id per family
    const representative: Record<string, string> = {
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
      fallback: "vllm/deepseek-v4.1-flash-pool",
    }

    // when each representative id is resolved
    const reached = FAMILY_IDS.filter((family) => {
      const id = representative[family]
      return id !== undefined && resolveModelFamily(id) === family
    })

    // then the reached families are the full tuple, in its order
    expect(reached).toEqual([...FAMILY_IDS])
  })
})
