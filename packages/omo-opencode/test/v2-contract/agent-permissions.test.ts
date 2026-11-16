import { describe, expect, it } from "bun:test"
import { registerAgents } from "../../src/v2/agents"

/**
 * Permission contract for the OMO v2 agents.
 *
 * `registerAgents` replaces `agent.permissions`, so it also replaces the base
 * policy opencode ships for builtin agents. Any action the definition does not
 * enumerate then falls through to the evaluator's default `ask`, and a pending
 * `ask` is only answered while its TUI tab is focused — a background session
 * blocks forever. These tests pin the invariant: no known action may resolve to
 * `ask`, and the explicit denies must keep winning.
 */

type Rule = { action: string; resource: string; effect: "allow" | "deny" | "ask" }

type Agent = {
  id: string
  name?: string
  description?: string
  mode?: string
  system?: string
  hidden?: boolean
  color?: string
  permissions: Rule[]
}

// Mirrors opencode core: `*` = zero or more chars, `?` = one char, whole value.
function matches(pattern: string, value: string) {
  const source = pattern
    .split("")
    .map((char) => (char === "*" ? ".*" : char === "?" ? "." : char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("")
  return new RegExp(`^${source}$`).test(value)
}

// Mirrors opencode core `Permission.evaluate`: last matching rule wins, default ask.
function evaluate(action: string, resource: string, rules: readonly Rule[]): Rule {
  return (
    [...rules].reverse().find((rule) => matches(rule.action, action) && matches(rule.resource, resource)) ?? {
      action,
      resource: "*",
      effect: "ask",
    }
  )
}

function fakeContext(seed: string[]) {
  const agents = new Map<string, Agent>()
  for (const id of seed) agents.set(id, { id, permissions: [] })

  const ctx = {
    agent: {
      transform: async (fn: (editor: unknown) => void) => {
        fn({
          list: () => [...agents.values()],
          get: (id: string) => agents.get(id),
          update: (id: string, mutate: (agent: Agent) => void) => {
            const agent = agents.get(id) ?? { id, permissions: [] }
            mutate(agent)
            agents.set(id, agent)
          },
          default: () => {},
          remove: (id: string) => agents.delete(id),
        })
      },
      list: async () => ({ data: [...agents.values()] }),
    },
    rpc: {
      register: async () => ({ dispose: async () => {} }),
    },
    session: { create: async () => ({ id: "ses_test", agent: "sisyphus" }) },
  }

  return { ctx, agents }
}

// Builtin ids the registration touches plus the OMO agent ids.
const BUILTIN = ["build", "plan", "general", "explore", "title", "summary", "compaction"]
const OMO_AGENTS = [
  "sisyphus",
  "hephaestus",
  "prometheus",
  "oracle",
  "librarian",
  "explore",
  "multimodal-looker",
  "metis",
  "momus",
  "sisyphus-junior",
]

// Every action the v2 permission evaluator can receive (docs/permissions).
const ACTIONS = [
  "read",
  "edit",
  "glob",
  "grep",
  "shell",
  "subagent",
  "skill",
  "question",
  "webfetch",
  "websearch",
  "external_directory",
  "execute",
  "opencode_list_mcp_resources",
  "opencode_read_mcp_resource",
  "brave_search_brave_web_search",
  "call_omo_agent",
]

async function registered() {
  const { ctx, agents } = fakeContext([...BUILTIN, ...OMO_AGENTS])
  await registerAgents(ctx as never)
  return agents
}

describe("OMO v2 agent permissions", () => {
  it("never falls through to `ask` for a known action", async () => {
    const agents = await registered()
    const failures: string[] = []

    for (const id of OMO_AGENTS) {
      const agent = agents.get(id)
      expect(agent).toBeDefined()
      for (const action of ACTIONS) {
        const effect = evaluate(action, "*", agent?.permissions ?? []).effect
        if (effect === "ask") failures.push(`${id}: ${action} -> ask`)
      }
    }

    expect(failures).toEqual([])
  })

  it("keeps the explicit denies authoritative", async () => {
    const agents = await registered()
    const effect = (id: string, action: string) => evaluate(action, "*", agents.get(id)?.permissions ?? []).effect

    // Orchestrators delegate, but never re-enter the OMO dispatch tool.
    expect(effect("sisyphus", "subagent")).toBe("allow")
    expect(effect("sisyphus", "call_omo_agent")).toBe("deny")
    expect(effect("hephaestus", "call_omo_agent")).toBe("deny")

    // Read-only consultants must not mutate or spawn work.
    for (const id of ["oracle", "librarian", "explore"]) {
      expect(effect(id, "edit")).toBe("deny")
      expect(effect(id, "subagent")).toBe("deny")
    }
    expect(effect("oracle", "external_directory")).toBe("allow")

    // sisyphus-junior may delegate through the OMO tool, not through subagent.
    expect(effect("sisyphus-junior", "subagent")).toBe("deny")
    expect(effect("sisyphus-junior", "call_omo_agent")).toBe("allow")

    // multimodal-looker stays read-only.
    expect(effect("multimodal-looker", "read")).toBe("allow")
    expect(effect("multimodal-looker", "shell")).toBe("deny")
  })

  it("uses v2 action names (no inert v1 aliases)", async () => {
    const agents = await registered()
    const actions = new Set((agents.get("prometheus")?.permissions ?? []).map((rule) => rule.action))
    expect(actions.has("shell")).toBe(true)
    expect(actions.has("bash")).toBe(false)

    const explore = new Set((agents.get("explore")?.permissions ?? []).map((rule) => rule.action))
    expect(explore.has("subagent")).toBe(true)
    expect(explore.has("task")).toBe(false)
  })
})
