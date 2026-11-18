/**
 * [OMC] V2 sidebar wire contract.
 *
 * One definition shared by both processes: the server plugin registers it and
 * emits, the TUI plugin resolves it through `ctx.client.rpc(definition)` to
 * subscribe and to ask for the current snapshot on mount.
 *
 * The payload schema is intentionally permissive (`additionalProperties: true`)
 * so a snapshot shape change never requires a wire migration; the TUI validates
 * the payload with the real Zod schema (`parseSnapshot`) before rendering.
 */

export const SIDEBAR_RPC_ID = "omo-sidebar"
export const SIDEBAR_METHOD = "sidebar-snapshot"
export const SIDEBAR_EVENT = "sidebar-snapshot"

const OBJECT_SCHEMA = { type: "object", additionalProperties: true } as const

export const sidebarRpcDefinition = {
  id: SIDEBAR_RPC_ID,
  methods: {
    [SIDEBAR_METHOD]: {
      input: OBJECT_SCHEMA,
      output: OBJECT_SCHEMA,
    },
  },
  events: {
    [SIDEBAR_EVENT]: {
      schema: OBJECT_SCHEMA,
    },
  },
} as const
