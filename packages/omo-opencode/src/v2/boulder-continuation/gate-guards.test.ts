import { describe, expect, it } from "bun:test"
import { evaluateContinuation } from "./gate"
import { createWorkCounterState } from "./signature"
import { assistantMessage, makeHarness } from "./fakes-support"

/**
 * [OMC] v2 boulder-continuation gate guard rows (task 8).
 *
 * One named test per guard of the SPEC.md 3.7 order plus the read diagnosis:
 * blocked-marker, context-pressure, no-progress threshold, cooldown, cap,
 * backoff/injection-failure, and the absent/corrupt state skips.
 */

describe("evaluateContinuation — guards", () => {
  describe("#given a completed/abandoned work status", () => {
    describe("#when the turn ends", () => {
      it("#then it skips silently", async () => {
        const harness = makeHarness()
        harness.status = "abandoned"

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "not-continuable", workId: "wk_1" })
        expect(harness.infos).toHaveLength(0)
        expect(harness.warns).toHaveLength(0)
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given the no-progress counter is already at the threshold", () => {
    describe("#when the next identical turn end arrives", () => {
      it("#then it emits zero synthetic", async () => {
        const harness = makeHarness()
        harness.counters.set("wk_1", {
          ...createWorkCounterState(),
          signature: "wk_1:1/2",
          consecutive_no_progress: 2,
          steers_total: 2,
          last_injected_at: 0,
        })

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "no-progress", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given the last assistant message opens with the blocker marker", () => {
    describe("#when the turn ends", () => {
      it("#then the blocked-marker guard skips with zero synthetic", async () => {
        const harness = makeHarness()
        harness.messages = [
          assistantMessage("<ulw-execute-blocked-external>\nwaiting on credentials", 1),
        ]

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "blocked-marker", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given a context-pressure signal in the transcript", () => {
    describe("#when the turn ends", () => {
      it("#then the pressure valve skips with zero synthetic", async () => {
        const harness = makeHarness()
        harness.messages = [assistantMessage("truncated turn", 1, "length")]

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "context-pressure", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given the cooldown window is still open", () => {
    describe("#when the turn ends", () => {
      it("#then it postpones with zero synthetic", async () => {
        const harness = makeHarness()
        harness.counters.set("wk_1", {
          ...createWorkCounterState(),
          signature: "wk_1:1/2",
          last_injected_at: harness.nowMs,
        })

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "cooldown", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given the hard cap is reached", () => {
    describe("#when the turn ends", () => {
      it("#then it stops with zero synthetic", async () => {
        const harness = makeHarness()
        harness.counters.set("wk_1", { ...createWorkCounterState(), steers_total: 30 })

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "cap", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })

  describe("#given an injection failure", () => {
    describe("#when the turn ends", () => {
      it("#then the failure streak advances and zero synthetic is emitted", async () => {
        const harness = makeHarness()
        harness.failInjection = true

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "injection-failed", workId: "wk_1" })
        expect(harness.synthetics).toHaveLength(0)
        expect(harness.counters.get("wk_1")?.prompt_failures).toBe(1)
      })
    })
  })

  describe("#given an absent boulder file", () => {
    describe("#when the turn ends", () => {
      it("#then it skips silently", async () => {
        const harness = makeHarness()
        harness.absent = true

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "absent-state" })
        expect(harness.infos).toHaveLength(0)
        expect(harness.warns).toHaveLength(0)
      })
    })
  })

  describe("#given a corrupt boulder file", () => {
    describe("#when the turn ends", () => {
      it("#then it skips with a warn and zero synthetic", async () => {
        const harness = makeHarness()
        harness.corrupt = true

        const outcome = await evaluateContinuation(harness.deps, "ses_X")

        expect(outcome).toEqual({ action: "skipped", reason: "corrupt-state" })
        expect(harness.infos[0]).toContain("corrupt-state")
        expect(harness.synthetics).toHaveLength(0)
      })
    })
  })
})
