import { describe, expect, it } from "bun:test"
import type { SessionInboxSynthetic, SessionMessageInfo } from "@opencode/client"
import { Plugin } from "@opencode/plugin"
import { isBoulderContinuationEnabled, registerBoulderContinuation } from "./register"

/**
 * [OMC] v2 boulder-continuation registration (task 11).
 *
 * A fake plugin context records every host interaction so the disabled default
 * is provably inert (no event subscription, no storage access) and the enabled
 * path subscribes and stops on dispose. The RPC status method is captured and
 * invoked to pin its documented shape.
 */

interface FakeState {
  subscribeCalls: number
  storageGets: string[]
  storageSets: string[]
  rpcId: string | null
  rpcDisposed: boolean
  signal: AbortSignal | undefined
  status: (() => Promise<unknown>) | null
}

function idleStream(signal: AbortSignal | undefined): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () =>
          new Promise<IteratorResult<never>>((resolve) => {
            const finish = (): void => resolve({ done: true, value: undefined as never })
            if (signal?.aborted) finish()
            else signal?.addEventListener("abort", finish, { once: true })
          }),
      }
    },
  }
}

function fakeSynthetic(): SessionInboxSynthetic {
  return {
    id: "syn_1",
    sessionID: "ses_X",
    time: { created: 0 },
    type: "synthetic",
    payload: { text: "", description: "", metadata: {} },
    delivery: "steer",
  }
}

function makeFakeCtx(options: unknown): { ctx: Plugin.Context; state: FakeState } {
  const state: FakeState = {
    subscribeCalls: 0,
    storageGets: [],
    storageSets: [],
    rpcId: null,
    rpcDisposed: false,
    signal: undefined,
    status: null,
  }

  const ctx = {
    location: { directory: "/nonexistent-omo-t11-dir" },
    options,
    event: {
      subscribe: (subscribeOptions?: { signal?: AbortSignal }) => {
        state.subscribeCalls += 1
        state.signal = subscribeOptions?.signal
        return idleStream(subscribeOptions?.signal)
      },
    },
    session: {
      context: async (): Promise<SessionMessageInfo[]> => [],
      synthetic: async (): Promise<SessionInboxSynthetic> => fakeSynthetic(),
    },
    storage: {
      get: async (key: string) => {
        state.storageGets.push(key)
        return undefined
      },
      set: async (key: string) => {
        state.storageSets.push(key)
      },
      remove: async () => undefined,
      scan: async () => ({ entries: [] }),
    },
    rpc: {
      register: async (
        definition: { id: string },
        handlers: Record<string, () => Promise<unknown>>,
      ) => {
        state.rpcId = definition.id
        state.status = handlers["status"] ?? null
        return { dispose: async () => { state.rpcDisposed = true }, events: { emit: async () => undefined } }
      },
    },
  } as unknown as Plugin.Context

  return { ctx, state }
}

describe("isBoulderContinuationEnabled", () => {
  it("is true only for boulder_continuation.enabled === true", () => {
    expect(isBoulderContinuationEnabled({ boulder_continuation: { enabled: true } })).toBe(true)
    expect(isBoulderContinuationEnabled({ boulder_continuation: { enabled: false } })).toBe(false)
    expect(isBoulderContinuationEnabled({ boulder_continuation: {} })).toBe(false)
    expect(isBoulderContinuationEnabled({})).toBe(false)
    expect(isBoulderContinuationEnabled(undefined)).toBe(false)
    expect(isBoulderContinuationEnabled("nope")).toBe(false)
  })
})

describe("registerBoulderContinuation", () => {
  describe("#given the flag is absent (default false)", () => {
    describe("#when registered", () => {
      it("#then it subscribes to no event and touches no storage", async () => {
        const { ctx, state } = makeFakeCtx({})
        const dispose = await registerBoulderContinuation(ctx)

        expect(state.subscribeCalls).toBe(0)
        expect(state.storageGets).toHaveLength(0)
        expect(state.storageSets).toHaveLength(0)

        await dispose()
        expect(state.rpcDisposed).toBe(true)
      })

      it("#then the status RPC reports enabled:false", async () => {
        const { ctx, state } = makeFakeCtx({ boulder_continuation: { enabled: false } })
        await registerBoulderContinuation(ctx)

        expect(state.rpcId).toBe("omo.continuation")
        expect(state.status).not.toBeNull()
        const result = (await state.status?.()) as Record<string, unknown>
        expect(result).toEqual({ enabled: false, works: [], lastDecision: null })
      })
    })
  })

  describe("#given the flag is true", () => {
    describe("#when registered", () => {
      it("#then it subscribes and the returned dispose stops the loop", async () => {
        const { ctx, state } = makeFakeCtx({ boulder_continuation: { enabled: true } })
        const dispose = await registerBoulderContinuation(ctx)

        expect(state.subscribeCalls).toBe(1)
        expect(state.signal?.aborted).toBe(false)

        await dispose()
        expect(state.signal?.aborted).toBe(true)
        expect(state.rpcDisposed).toBe(true)
      })

      it("#then the status RPC reports enabled:true with the documented shape", async () => {
        const { ctx, state } = makeFakeCtx({ boulder_continuation: { enabled: true } })
        await registerBoulderContinuation(ctx)

        const result = (await state.status?.()) as Record<string, unknown>
        expect(result["enabled"]).toBe(true)
        expect(Array.isArray(result["works"])).toBe(true)
        expect(result["lastDecision"]).toBeNull()
      })
    })
  })
})
