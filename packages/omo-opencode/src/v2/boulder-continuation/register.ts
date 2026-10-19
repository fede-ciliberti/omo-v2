/**
 * [OMC] v2 boulder-continuation registration (task 11).
 *
 * Wires the continuation module into `setup(ctx)` behind the
 * `boulder_continuation.enabled` plugin option (default false). The flag is read
 * from the host plugin-options surface `ctx.options` (type `PluginOptions` =
 * `Readonly<Record<string, any>>`, file `node_modules/@opencode/plugin/dist/options.d.ts`).
 *
 * When disabled the register is inert: it subscribes to no event, reads no
 * storage and touches no boulder state. The `omo.continuation` RPC status method
 * is registered either way so the flag stays observable (`enabled:false`).
 */

import { Plugin } from "@opencode/plugin"
import type { JsonValue } from "@opencode/client"
import { z } from "zod"
import { getBoulderWorks, readBoulderStateDetailed } from "@oh-my-opencode/boulder-state"
import { createStorageCounterStore, type ContinuationStorage } from "./gate-store"
import type { ContinuationOutcome } from "./gate-order"
import { startContinuationLoop, type ContinuationHostContext } from "./loop"

/** The host plugin context; the real `Plugin.Context` is passed from `setup`. */
type PluginContext = Plugin.Context

/** In-memory last-decision record surfaced by the RPC status method. */
export interface LastDecision {
  readonly sessionId: string
  readonly action: ContinuationOutcome["action"]
  readonly reason: string | null
}

/** Per-work counter snapshot plus its `work_id` (status shape). */
export interface WorkStatus {
  readonly work_id: string
  readonly steers_total: number
  readonly consecutive_no_progress: number
  readonly prompt_failures: number
  readonly last_injected_at: number | null
  readonly last_failure_at: number | null
  readonly disarmed: boolean
  readonly signature: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Read the `boulder_continuation.enabled` flag from the plugin options. Any
 * shape other than a boolean `true` (missing key, wrong type, non-object
 * options) reads as disabled, so the default is false.
 */
export function isBoulderContinuationEnabled(options: unknown): boolean {
  if (!isRecord(options)) return false
  const flag = options["boulder_continuation"]
  if (!isRecord(flag)) return false
  return flag["enabled"] === true
}

const workStatusSchema = z.object({
  work_id: z.string(),
  steers_total: z.number(),
  consecutive_no_progress: z.number(),
  prompt_failures: z.number(),
  last_injected_at: z.number().nullable(),
  last_failure_at: z.number().nullable(),
  disarmed: z.boolean(),
  signature: z.string().nullable(),
})

const lastDecisionSchema = z.object({
  sessionId: z.string(),
  action: z.string(),
  reason: z.string().nullable(),
})

const statusOutputSchema = z.object({
  enabled: z.boolean(),
  works: z.array(workStatusSchema),
  lastDecision: lastDecisionSchema.nullable(),
})

/**
 * Adapt the host storage domain to the module's `ContinuationStorage`. The two
 * JSON types differ only in array mutability (`Schema.Json` is readonly), so the
 * values are asserted to the module's mutable `JsonValue` shape.
 */
function toContinuationStorage(ctx: PluginContext): ContinuationStorage {
  return {
    get: async (key) => {
      const value = await ctx.storage.get(key)
      return value === undefined ? undefined : (value as JsonValue)
    },
    set: async (key, value) => {
      await ctx.storage.set(key, value)
    },
  }
}

/** The plugin-context slice the continuation loop needs, with adapted storage. */
function toHostContext(ctx: PluginContext): ContinuationHostContext {
  return {
    location: ctx.location,
    event: ctx.event,
    session: ctx.session,
    storage: toContinuationStorage(ctx),
  }
}

/** Read every work's counters by scanning the boulder state once (read-only). */
async function readWorkStatuses(ctx: PluginContext): Promise<WorkStatus[]> {
  const read = readBoulderStateDetailed(ctx.location.directory)
  if (read.status !== "ok") return []
  const store = createStorageCounterStore(toContinuationStorage(ctx))
  const works: WorkStatus[] = []
  for (const work of getBoulderWorks(read.state)) {
    const counter = await store.read(work.work_id)
    works.push({ work_id: work.work_id, ...counter })
  }
  return works
}

/**
 * Register the continuation module. Always registers the `omo.continuation`
 * status RPC; only when `boulder_continuation.enabled` is true does it start the
 * event loop. The returned dispose stops the loop (if any) and disposes the RPC.
 */
export async function registerBoulderContinuation(
  ctx: PluginContext,
): Promise<() => Promise<void>> {
  const enabled = isBoulderContinuationEnabled(ctx.options)
  let lastDecision: LastDecision | null = null

  const rpc = await ctx.rpc.register(
    {
      id: "omo.continuation",
      methods: {
        status: {
          input: z.object({}),
          output: statusOutputSchema,
        },
      },
      events: {},
    },
    {
      status: async () => {
        if (!enabled) return { enabled: false, works: [], lastDecision: null }
        return { enabled: true, works: await readWorkStatuses(ctx), lastDecision }
      },
    },
  )

  const stopLoop = enabled
    ? startContinuationLoop(toHostContext(ctx), {
        onDecision: (sessionId, outcome) => {
          lastDecision = {
            sessionId,
            action: outcome.action,
            reason: outcome.action === "skipped" ? outcome.reason : null,
          }
        },
      })
    : null

  return async () => {
    stopLoop?.()
    await rpc.dispose()
  }
}
