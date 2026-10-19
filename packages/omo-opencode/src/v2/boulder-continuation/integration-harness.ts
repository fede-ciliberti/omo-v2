/**
 * [OMC] v2 boulder-continuation integration harness (task 12).
 *
 * In-module fakes for the host surfaces the end-to-end integration test drives:
 * a scripted event stream, a recording session domain, in-memory counter storage
 * and a capturing logger. The boulder-state port is the REAL package bound to a
 * temp-dir `.omo/boulder.json` + plan markdown, so `readBoulderStateDetailed`,
 * `getPlanChecklist`, `reconcileStaleWorks` and `completeBoulder` all run for
 * real; only the event/session/transcript surfaces are faked.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { JsonValue, SessionInboxSynthetic, SessionMessageInfo } from "@opencode/client"
import type { ContinuationLogger } from "./gate"
import type { ContinuationSyntheticInput } from "./inject"
import {
  startContinuationLoop,
  type ContinuationHostContext,
  type ContinuationHostEvent,
  type ContinuationTimers,
} from "./loop"
const TEMP_PARENT = join(tmpdir(), "opencode")

export interface HarnessSession {
  messages: SessionMessageInfo[]
  failInjection: boolean
}

export interface IntegrationHarness {
  readonly dir: string
  readonly session: HarnessSession
  readonly synthetics: ContinuationSyntheticInput[]
  readonly infos: string[]
  readonly warns: string[]
  /** Push a turn-end event and let the loop arm its debounce. */
  succeeded(sessionId: string): Promise<void>
  /** Push an arbitrary event and let the loop react. */
  push(event: ContinuationHostEvent): Promise<void>
  /** Fire every armed timer and let the gate finish. */
  fire(): Promise<void>
  /** Push a turn end, then fire the debounce (the common single-turn drive). */
  turn(sessionId: string): Promise<void>
  stop(): void
  cleanup(): void
}

async function flush(times = 16): Promise<void> {
  for (let index = 0; index < times; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

interface ScriptedStream {
  subscribe(options?: { signal?: AbortSignal }): AsyncIterable<ContinuationHostEvent>
  push(event: ContinuationHostEvent): void
}

function makeStream(): ScriptedStream {
  const queue: ContinuationHostEvent[] = []
  let notify: (() => void) | null = null

  async function* generate(): AsyncGenerator<ContinuationHostEvent> {
    while (true) {
      if (queue.length === 0) await new Promise<void>((resolve) => (notify = resolve))
      while (queue.length > 0) {
        const event = queue.shift()
        if (event !== undefined) yield event
      }
    }
  }

  return {
    subscribe: () => generate(),
    push: (event) => {
      queue.push(event)
      notify?.()
      notify = null
    },
  }
}

interface ManualTimers {
  timers: ContinuationTimers
  fire(): void
}

function makeManualTimers(): ManualTimers {
  const handles = new Map<object, () => void>()
  const timers: ContinuationTimers = {
    setTimeout: (handler) => {
      const handle: object = {}
      handles.set(handle, handler)
      return handle
    },
    clearTimeout: (handle) => {
      if (typeof handle === "object" && handle !== null) handles.delete(handle)
    },
  }
  return {
    timers,
    fire: () => {
      const handlers = [...handles.values()]
      handles.clear()
      for (const handler of handlers) handler()
    },
  }
}

function fakeSynthetic(input: ContinuationSyntheticInput): SessionInboxSynthetic {
  return {
    id: `syn_${input.sessionID}`,
    sessionID: input.sessionID,
    time: { created: 0 },
    type: "synthetic",
    payload: { text: input.text, description: input.description, metadata: input.metadata },
    delivery: "steer",
  }
}

export function makeHarness(): IntegrationHarness {
  mkdirSync(TEMP_PARENT, { recursive: true })
  const dir = mkdtempSync(join(TEMP_PARENT, "omo-bc-"))
  const stream = makeStream()
  const manual = makeManualTimers()
  const synthetics: ContinuationSyntheticInput[] = []
  const infos: string[] = []
  const warns: string[] = []
  const storage = new Map<string, JsonValue>()
  const session: HarnessSession = { messages: [], failInjection: false }

  const ctx: ContinuationHostContext = {
    location: { directory: dir },
    event: { subscribe: (options) => stream.subscribe(options) },
    session: {
      context: async () => session.messages,
      synthetic: async (input) => {
        if (session.failInjection) throw new Error("injection failed")
        synthetics.push(input)
        return fakeSynthetic(input)
      },
    },
    storage: {
      get: async (key) => storage.get(key),
      set: async (key, value) => {
        storage.set(key, value)
      },
    },
  }

  const log: ContinuationLogger = {
    info: (message) => infos.push(message),
    warn: (message) => warns.push(message),
  }
  const stop = startContinuationLoop(ctx, {
    deps: { log },
    debounceWindowMs: 4000,
    timers: manual.timers,
  })

  return {
    dir,
    session,
    synthetics,
    infos,
    warns,
    succeeded: async (sessionId) => {
      stream.push({ type: "session.execution.succeeded", data: { sessionID: sessionId } })
      await flush()
    },
    push: async (event) => {
      stream.push(event)
      await flush()
    },
    fire: async () => {
      manual.fire()
      await flush()
    },
    turn: async (sessionId) => {
      stream.push({ type: "session.execution.succeeded", data: { sessionID: sessionId } })
      await flush()
      manual.fire()
      await flush()
    },
    stop,
    cleanup: () => {
      stop()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
