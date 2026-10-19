import { describe, expect, it } from "bun:test"
import type { SessionInboxSynthetic } from "@opencode/client"
import type { ContinuationDeps } from "./gate"
import {
  extractSessionIdFromEvent,
  startContinuationLoop,
  type ContinuationHostContext,
  type ContinuationHostEvent,
  type ContinuationTimers,
} from "./loop"
import { makeHarness } from "./fakes-support"

/**
 * [OMC] v2 boulder-continuation loop (task 8).
 *
 * Drives the subscription lifecycle with an in-module event stream, a manual
 * timer scheduler and the gate fakes: a turn end wakes the gate after the
 * debounce fires, and any of the four user-activity events cancels the pending
 * steer before it fires.
 */

function makeStream() {
  const queue: ContinuationHostEvent[] = []
  let notify: (() => void) | null = null
  let closed = false
  let signal: AbortSignal | undefined

  async function* generate(): AsyncGenerator<ContinuationHostEvent> {
    while (!closed) {
      if (queue.length === 0) await new Promise<void>((resolve) => (notify = resolve))
      while (queue.length > 0) yield queue.shift() as ContinuationHostEvent
    }
  }

  return {
    subscribe: (options?: { signal?: AbortSignal }) => {
      signal = options?.signal
      return generate()
    },
    push: (event: ContinuationHostEvent) => {
      queue.push(event)
      notify?.()
      notify = null
    },
    signal: () => signal,
  }
}

function makeManualTimers() {
  const handles = new Map<number, () => void>()
  let next = 1
  const timers: ContinuationTimers = {
    setTimeout: (handler) => {
      const id = next
      next += 1
      handles.set(id, handler)
      return id
    },
    clearTimeout: (handle) => {
      handles.delete(handle as number)
    },
  }
  return {
    timers,
    fire: () => {
      const handlers = [...handles.values()]
      handles.clear()
      for (const handler of handlers) handler()
    },
    pending: () => handles.size,
  }
}

function makeCtx(stream: ReturnType<typeof makeStream>): ContinuationHostContext {
  return {
    location: { directory: "/repo" },
    event: { subscribe: (options) => stream.subscribe(options) },
    session: {
      context: async () => [],
      synthetic: async (): Promise<SessionInboxSynthetic> => {
        throw new Error("ctx.session.synthetic must not be called directly in loop tests")
      },
    },
    storage: {
      get: async () => undefined,
      set: async () => undefined,
    },
  }
}

async function flush(times = 12): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

function succeeded(sessionId: string): ContinuationHostEvent {
  return { type: "session.execution.succeeded", data: { sessionID: sessionId } }
}

function startLoop(overrides: Partial<ContinuationDeps> = {}) {
  const harness = makeHarness()
  const stream = makeStream()
  const manual = makeManualTimers()
  const stop = startContinuationLoop(makeCtx(stream), {
    deps: { ...harness.deps, ...overrides },
    debounceWindowMs: 4000,
    timers: manual.timers,
  })
  return { harness, stream, manual, stop }
}

describe("startContinuationLoop", () => {
  describe("#given an open plan and a turn end", () => {
    describe("#when the debounce fires", () => {
      it("#then exactly one synthetic is emitted", async () => {
        const { harness, stream, manual, stop } = startLoop()

        stream.push(succeeded("ses_X"))
        await flush()
        expect(manual.pending()).toBe(1)
        manual.fire()
        await flush()

        expect(harness.synthetics).toHaveLength(1)
        stop()
      })
    })
  })

  describe("#given a pending debounce and a user-activity event", () => {
    describe("#when the cancel event arrives before the timer fires", () => {
      it("#then the steer is cancelled and zero synthetic is emitted", async () => {
        const { harness, stream, manual, stop } = startLoop()

        stream.push(succeeded("ses_X"))
        await flush()
        expect(manual.pending()).toBe(1)

        stream.push({ type: "session.inbox.delivered", data: { sessionID: "ses_X" } })
        await flush()
        manual.fire()
        await flush()

        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos.some((line) => line.includes("debounce-cancelled"))).toBe(true)
        stop()
      })
    })
  })

  describe("#given a turn end with no session id", () => {
    describe("#when the event is delivered", () => {
      it("#then it is ignored and no timer is armed", async () => {
        const { harness, stream, manual, stop } = startLoop()

        stream.push({ type: "session.execution.succeeded" })
        await flush()
        manual.fire()
        await flush()

        expect(manual.pending()).toBe(0)
        expect(harness.synthetics).toHaveLength(0)
        stop()
      })
    })
  })

  describe("#given a running loop", () => {
    describe("#when stop is called", () => {
      it("#then the subscription aborts and pending timers are cleared", async () => {
        const { stream, manual, stop } = startLoop()

        stream.push(succeeded("ses_X"))
        await flush()
        expect(manual.pending()).toBe(1)

        stop()

        expect(stream.signal()?.aborted).toBe(true)
        expect(manual.pending()).toBe(0)
      })
    })
  })
})

describe("extractSessionIdFromEvent", () => {
  it("reads a string sessionID from the event data", () => {
    expect(extractSessionIdFromEvent({ type: "x", data: { sessionID: "ses_A" } })).toBe("ses_A")
  })

  it("returns undefined when the data is missing or not a string", () => {
    expect(extractSessionIdFromEvent({ type: "x" })).toBeUndefined()
    expect(extractSessionIdFromEvent({ type: "x", data: { sessionID: 7 } })).toBeUndefined()
  })
})
