import { describe, expect, it } from "bun:test"
import { evaluateContinuation } from "./gate"
import { createWorkCounterState } from "./signature"
import { makeHarness, userMessage } from "./fakes-support"

/**
 * [OMC] v2 boulder-continuation gate core scenarios (task 8).
 *
 * Drives `evaluateContinuation` with in-module host fakes. Covers the happy
 * path, completion, the status gate, the no-progress convergence, the debounce
 * cancel, the D11/B1 stop-phrase wiring, the silent lookup miss and the re-read
 * discipline. Guard-specific rows live in `gate-guards.test.ts`.
 */

function advance(harness: { nowMs: number }, delta = 5001): void {
  harness.nowMs += delta
}

describe("evaluateContinuation — core", () => {
  describe("#given an open plan (1 done / 1 open)", () => {
    describe("#when the turn ends", () => {
      it("#then exactly one synthetic carries the rendered directive", async () => {
        const harness = makeHarness()

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome.action).toBe("injected")
        expect(harness.synthetics).toHaveLength(1)
        const text = harness.synthetics[0]?.text ?? ""
        expect(text).toContain("<ulw-execute-continuation>")
        expect(text).toContain("`1` of `2`")
        expect(text).toContain("opencode:ses_X")
        expect(harness.synthetics[0]?.delivery).toBe("steer")
      })
    })
  })

  describe("#given a completed plan", () => {
    describe("#when the turn ends", () => {
      it("#then completeBoulder runs and no synthetic is emitted", async () => {
        const harness = makeHarness()
        harness.plan = { total: 2, completed: 2, remaining: 0, nextTaskLabel: null }

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "completed", workId: "wk_1", signature: "wk_1:2/2" })
        expect(harness.completed).toEqual(["wk_1"])
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given an unknown work status", () => {
    describe("#when the turn ends", () => {
      it("#then it skips with the LOOKUP 5.3 warn and no synthetic", async () => {
        const harness = makeHarness()
        harness.status = "awaiting-user-ok"

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "unknown-status", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
        expect(harness.warns).toHaveLength(1)
        expect(harness.warns[0]).toContain(
          'unknown work status "awaiting-user-ok" for work_id=wk_1',
        )
      })
    })
  })

  describe("#given a never-touching agent", () => {
    describe("#when identical turn ends repeat", () => {
      it("#then the synthetic count converges to two and the third is silent", async () => {
        const harness = makeHarness()

        const first = await evaluateContinuation(harness.deps, "ses_X")
        advance(harness)
        const second = await evaluateContinuation(harness.deps, "ses_X")
        advance(harness)
        const third = await evaluateContinuation(harness.deps, "ses_X")

        expect(first.action).toBe("injected")
        expect(second.action).toBe("injected")
        expect(third).toEqual({ action: "skipped", reason: "no-progress", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(2)
      })
    })
  })

  describe("#given a user message inside the debounce window", () => {
    describe("#when the debounce is cancelled", () => {
      it("#then it skips with zero synthetic", async () => {
        const harness = makeHarness()
        harness.debounceResult = false

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "debounce-cancelled" })
        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos[0]).toContain("debounce-cancelled")
      })
    })
  })

  describe("#given a stop-phrase user message since the last steer", () => {
    describe("#when the next turn ends", () => {
      it("#then the work disarms and emits zero synthetic (B1 wiring)", async () => {
        const harness = makeHarness()
        const first = await evaluateContinuation(harness.deps, "ses_X")
        expect(first.action).toBe("injected")

        harness.messages = [userMessage("Pará.", harness.nowMs + 1000)]
        advance(harness)

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "disarmed", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(1)
        expect(harness.counters.get("wk_1")?.disarmed).toBe(true)
        expect(harness.infos.some((line) => line.includes("disarmed"))).toBe(true)
      })
    })
  })

  describe("#given a re-arm phrase after a stop phrase", () => {
    describe("#when the next turn ends", () => {
      it("#then continuation resumes with a synthetic", async () => {
        const harness = makeHarness()
        harness.counters.set("wk_1", { ...createWorkCounterState(), disarmed: true })
        harness.messages = [userMessage("Seguí.", harness.nowMs - 1)]

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome.action).toBe("injected")
        expect(harness.synthetics).toHaveLength(1)
      })
    })
  })

  describe("#given a session that belongs to no work", () => {
    describe("#when the turn ends", () => {
      it("#then the lookup miss is silent and emits zero synthetic", async () => {
        const harness = makeHarness()
        harness.sessionIds = ["opencode:ses_other"]

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "lookup-miss" })
        expect(harness.infos).toHaveLength(0)
        expect(harness.warns).toHaveLength(0)
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given a mid-turn checkbox change", () => {
    describe("#when the next turn ends", () => {
      it("#then the re-read observes the new state and completes instead of injecting", async () => {
        const harness = makeHarness()
        const first = await evaluateContinuation(harness.deps, "ses_X")
        expect(first.action).toBe("injected")

        harness.plan = { total: 2, completed: 2, remaining: 0, nextTaskLabel: null }
        advance(harness)

        const second = await evaluateContinuation(harness.deps, "ses_X")

        expect(harness.readCount).toBe(2)
        expect(second).toEqual({ action: "completed", workId: "wk_1", signature: "wk_1:2/2" })
        expect(harness.completed).toEqual(["wk_1"])
        expect(harness.synthetics).toHaveLength(1)
      })
    })
  })
})
