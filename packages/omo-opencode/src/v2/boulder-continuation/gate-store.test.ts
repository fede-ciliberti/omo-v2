import { describe, expect, it } from "bun:test"
import type { JsonValue } from "@opencode/client"
import {
  COUNTER_KEY_PREFIX,
  counterKey,
  createStorageCounterStore,
  parseCounterState,
  type ContinuationStorage,
} from "./gate-store"
import { createWorkCounterState, type WorkCounterState } from "./signature"

/**
 * [OMC] v2 boulder-continuation counter store (task 13).
 *
 * Durability verdict (probed 2026-10-17, task-13): `ctx.storage` is DURABLE.
 * The host backs the plugin storage domain with its KV service, which writes
 * rows into the SQLite `kv` table of `<XDG_DATA_HOME>/opencode/opencode.db`
 * (verified at runtime: a marker written by one host process was read back by a
 * fresh host process). Counters therefore live in `ctx.storage` under the
 * namespaced key `boulder-continuation/<work_id>`; no file fallback is built.
 *
 * These tests exercise the counter store through the `ContinuationStorage`
 * adapter surface (the same surface `ctx.storage` satisfies) and prove the
 * counters round-trip across a store instance boundary, which models a host
 * restart over a durable backing store.
 */

/** A durable storage double: the backing map outlives the adapter binding. */
function durableStorage(backing = new Map<string, JsonValue>()): ContinuationStorage {
  return {
    get: async (key) => backing.get(key),
    set: async (key, value) => {
      backing.set(key, value)
    },
  }
}

const sampleState: WorkCounterState = {
  steers_total: 7,
  consecutive_no_progress: 2,
  prompt_failures: 3,
  last_failure_at: 1_700_000_000_000,
  last_injected_at: 1_700_000_100_000,
  disarmed: true,
  signature: "wk_1a2b:3/9",
}

describe("counterKey", () => {
  it("namespaces the key as 'boulder-continuation/<work_id>'", () => {
    expect(counterKey("wk_1a2b")).toBe(`${COUNTER_KEY_PREFIX}wk_1a2b`)
    expect(counterKey("wk_1a2b")).toBe("boulder-continuation/wk_1a2b")
  })
})

describe("createStorageCounterStore round-trip through the storage adapter", () => {
  // given a durable storage backing a counter store
  it("reads back identical counters written by a previous store instance", async () => {
    const storage = durableStorage()

    // when a first store instance (process) writes the counters
    await createStorageCounterStore(storage).write("wk_1a2b", sampleState)

    // and a fresh store instance over the same durable backing reads them
    const readBack = await createStorageCounterStore(storage).read("wk_1a2b")

    // then every field survives the instance boundary unchanged
    expect(readBack).toEqual(sampleState)
  })

  it("stores under the namespaced key only", async () => {
    const storage = durableStorage()
    await createStorageCounterStore(storage).write("wk_1a2b", sampleState)

    const stored = await storage.get(counterKey("wk_1a2b"))
    expect(stored).toEqual(sampleState)
    expect(await storage.get("wk_1a2b")).toBeUndefined()
  })

  it("isolates counters per work_id", async () => {
    const storage = durableStorage()
    const store = createStorageCounterStore(storage)
    await store.write("wk_a", { ...createWorkCounterState(), steers_total: 1 })
    await store.write("wk_b", { ...createWorkCounterState(), steers_total: 9 })

    expect((await store.read("wk_a")).steers_total).toBe(1)
    expect((await store.read("wk_b")).steers_total).toBe(9)
  })

  it("reads an all-zero state for a work that was never written", async () => {
    const store = createStorageCounterStore(durableStorage())
    expect(await store.read("wk_never")).toEqual(createWorkCounterState())
  })
})

describe("parseCounterState", () => {
  // given malformed or missing persisted payloads
  it("resets a non-object payload to the all-zero state", () => {
    expect(parseCounterState(undefined)).toEqual(createWorkCounterState())
    expect(parseCounterState(null)).toEqual(createWorkCounterState())
    expect(parseCounterState("garbage")).toEqual(createWorkCounterState())
    expect(parseCounterState([1, 2, 3])).toEqual(createWorkCounterState())
  })

  it("drops non-finite and wrong-typed fields to safe defaults", () => {
    const parsed = parseCounterState({
      steers_total: Number.NaN,
      consecutive_no_progress: "5",
      prompt_failures: Number.POSITIVE_INFINITY,
      last_failure_at: "yesterday",
      last_injected_at: 42,
      disarmed: "yes",
      signature: 7,
    })
    expect(parsed).toEqual({
      steers_total: 0,
      consecutive_no_progress: 0,
      prompt_failures: 0,
      last_failure_at: null,
      last_injected_at: 42,
      disarmed: false,
      signature: null,
    })
  })
})
