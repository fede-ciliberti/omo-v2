import { describe, expect, test } from "bun:test"
import { registerAgents } from "./agents"
import { ATLAS_DOCTRINE_BASE } from "./agents/atlas-doctrine"
import { ATLAS_FAMILY_OVERLAYS } from "./agents/atlas-family-overlays"
import { FAMILY_OVERLAYS } from "./agents/family-overlays"
import { SISYPHUS_DOCTRINE_BASE } from "./agents/sisyphus-doctrine"

const EXPECTED_OPTION_KEYS = ["maxTokens", "temperature", "topP", "topK"]

type AgentRecord = {
  id: string
  name: unknown
  description?: string
  mode?: string
  system?: string
  hidden?: boolean
  color?: string
  permissions?: unknown
}

type ContextHookInput = {
  agent: string
  model: { id: string }
  system: Array<{ type: string; text?: string }>
  options: Record<string, unknown>
}

function makeContext() {
  const agents = new Map<string, AgentRecord>()
  const hooks = new Map<string, (input: ContextHookInput) => void>()
  const disposals: string[] = []

  const editor = {
    update(id: string, fn: (agent: AgentRecord) => void) {
      const agent = agents.get(id) ?? { id, name: id }
      agents.set(id, agent)
      fn(agent)
    },
    get(id: string) {
      return agents.get(id)
    },
    default() {
      return undefined
    },
  }

  const ctx = {
    agent: {
      transform: async (callback: (editorLike: typeof editor) => void) => {
        callback(editor)
        return { dispose: async () => {} }
      },
    },
    session: {
      hook: async (name: string, callback: (input: ContextHookInput) => void) => {
        hooks.set(name, callback)
        return {
          dispose: async () => {
            disposals.push(`session:${name}`)
          },
        }
      },
    },
    rpc: {
      register: async () => ({
        dispose: async () => {
          disposals.push("rpc")
        },
      }),
    },
  }

  return { ctx, agents, hooks, disposals }
}

describe("registerAgents doctrine wiring", () => {
  test("#given the plugin context #when agents register #then sisyphus carries the doctrine module verbatim", async () => {
    // given
    const { ctx, agents } = makeContext()

    // when
    await registerAgents(ctx as never)

    // then
    expect(agents.get("sisyphus")?.system).toBe(SISYPHUS_DOCTRINE_BASE)
    expect(agents.get("sisyphus")?.mode).toBe("primary")
  })

  test("#given a registered sisyphus request #when the context hook runs #then one doctrine part carries base+overlay and options stay allowlisted", async () => {
    // given
    const { ctx, hooks } = makeContext()
    await registerAgents(ctx as never)
    const hook = hooks.get("context")
    if (hook === undefined) throw new Error("no context hook registered")
    const input: ContextHookInput = {
      agent: "sisyphus",
      model: { id: "anthropic/claude-opus-4-8" },
      system: [{ type: "text", text: SISYPHUS_DOCTRINE_BASE }],
      options: {},
    }

    // when
    hook(input)

    // then
    const doctrineParts = input.system.filter((part) => part.text?.startsWith(SISYPHUS_DOCTRINE_BASE))
    expect(doctrineParts).toHaveLength(1)
    expect(doctrineParts[0]?.text).toBe(`${SISYPHUS_DOCTRINE_BASE}\n\n${FAMILY_OVERLAYS["claude-opus-4-8"]}`)
    for (const key of Object.keys(input.options)) {
      expect(EXPECTED_OPTION_KEYS).toContain(key)
    }
  })

  test("#given a registered atlas request #when the context hook runs #then one atlas part carries base+overlay and only temperature is written", async () => {
    // given
    const { ctx, hooks } = makeContext()
    await registerAgents(ctx as never)
    const hook = hooks.get("context")
    if (hook === undefined) throw new Error("no context hook registered")
    const input: ContextHookInput = {
      agent: "atlas",
      model: { id: "google/gemini-3-pro" },
      system: [{ type: "text", text: ATLAS_DOCTRINE_BASE }],
      options: { hostKey: "host-value" },
    }

    // when
    hook(input)

    // then
    const doctrineParts = input.system.filter((part) => part.text?.startsWith(ATLAS_DOCTRINE_BASE))
    expect(doctrineParts).toHaveLength(1)
    expect(doctrineParts[0]?.text).toBe(`${ATLAS_DOCTRINE_BASE}\n\n${ATLAS_FAMILY_OVERLAYS.gemini}`)
    expect(input.options).toEqual({ hostKey: "host-value", temperature: 0.1 })
  })

  test("#given the plugin context #when agents register #then atlas ships the canonical doctrine module verbatim", async () => {
    // given
    const { ctx, agents } = makeContext()

    // when
    await registerAgents(ctx as never)

    // then
    expect(agents.get("atlas")?.system).toBe(ATLAS_DOCTRINE_BASE)
    expect(agents.get("atlas")?.mode).toBe("primary")
  })

  test("#given the plugin context #when agents register #then exactly one context hook is registered", async () => {
    // given
    const { ctx, hooks } = makeContext()

    // when
    await registerAgents(ctx as never)

    // then
    expect([...hooks.keys()]).toEqual(["context"])
  })

  test("#given a registered oracle request #when the context hook runs #then no doctrine part is added", async () => {
    // given
    const { ctx, hooks } = makeContext()
    await registerAgents(ctx as never)
    const hook = hooks.get("context")
    if (hook === undefined) throw new Error("no context hook registered")
    const input: ContextHookInput = {
      agent: "oracle",
      model: { id: "anthropic/claude-opus-4-8" },
      system: [{ type: "text", text: "oracle prompt" }],
      options: {},
    }

    // when
    hook(input)

    // then
    expect(input.system).toHaveLength(1)
    expect(input.system[0]?.text).toBe("oracle prompt")
    expect(Object.keys(input.options)).toHaveLength(0)
  })

  test("#given a registered plugin #when the cleanup runs #then the doctrine hook and the RPC are both disposed", async () => {
    // given
    const { ctx, disposals } = makeContext()
    const cleanup = await registerAgents(ctx as never)

    // when
    await cleanup()

    // then
    expect(disposals).toEqual(["session:context", "rpc"])
  })
})
