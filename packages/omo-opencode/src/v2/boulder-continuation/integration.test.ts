import { afterEach, describe, expect, it } from "bun:test"
import {
  assistantMessage,
  blockedPlanMarkdown,
  compactionMessage,
  completedPlanMarkdown,
  makeHarness,
  openPlanMarkdown,
  readBoulderWorkStatus,
  SESSION_ID,
  userMessage,
  writeBoulder,
  writeCorruptBoulder,
  writePlan,
  type IntegrationHarness,
} from "./integration-support"

/**
 * [OMC] v2 boulder-continuation integration (task 12).
 *
 * End-to-end in-process: a scripted event stream drives the loop, the gate runs
 * against the REAL boulder-state package bound to a temp-dir `.omo/boulder.json`
 * plus plan markdown, and the recording session fake captures the synthetic.
 * Each scenario is a named test; the host event/session/transcript surfaces are
 * the only fakes.
 */

const harnesses: IntegrationHarness[] = []

afterEach(() => {
  for (const harness of harnesses.splice(0)) harness.cleanup()
})

function harnessWithPlan(
  markdown: string,
  sessionIds: readonly string[] = [`opencode:${SESSION_ID}`],
): IntegrationHarness {
  const harness = makeHarness()
  harnesses.push(harness)
  writePlan(harness.dir, markdown)
  writeBoulder(harness.dir, { sessionIds })
  return harness
}

function harnessWithCorruptBoulder(): IntegrationHarness {
  const harness = makeHarness()
  harnesses.push(harness)
  writePlan(harness.dir, openPlanMarkdown())
  writeCorruptBoulder(harness.dir)
  return harness
}

describe("boulder-continuation end-to-end", () => {
  describe("#given an open plan (1 done / 1 open)", () => {
    describe("#when the turn ends", () => {
      it("#then exactly one synthetic carries the fully substituted directive", async () => {
        const harness = harnessWithPlan(openPlanMarkdown())

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(1)
        const text = harness.synthetics[0]?.text ?? ""
        expect(text).toContain("<ulw-execute-continuation>")
        expect(text).toContain("`1` of `2`")
        expect(text).toContain("opencode:ses_X")
        expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/)
        expect(harness.synthetics[0]?.delivery).toBe("steer")
      })
    })
  })

  describe("#given a completed plan", () => {
    describe("#when the turn ends", () => {
      it("#then completeBoulder runs on disk and no synthetic is emitted", async () => {
        const harness = harnessWithPlan(completedPlanMarkdown())

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(0)
        expect(readBoulderWorkStatus(harness.dir)).toBe("completed")
      })
    })
  })

  describe("#given session ids written with a drifted prefix", () => {
    describe("#when the bare session id ends a turn", () => {
      it("#then bare, opencode: and codex: fixtures all match the same work", async () => {
        for (const stored of [SESSION_ID, `opencode:${SESSION_ID}`, `codex:${SESSION_ID}`]) {
          const harness = harnessWithPlan(openPlanMarkdown(), [stored])

          await harness.turn(SESSION_ID)

          expect(harness.synthetics).toHaveLength(1)
        }
      })
    })
  })

  describe("#given a blocked-external marker in the last assistant message", () => {
    describe("#when the turn ends", () => {
      it("#then the marker skips the guard and no synthetic is emitted", async () => {
        const harness = harnessWithPlan(openPlanMarkdown())
        harness.session.messages = [
          assistantMessage(
            ["<ulw-execute-blocked-external>", "Blocker: staging credential missing."].join("\n"),
            1000,
          ),
        ]

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos.some((line) => line.includes("blocked-marker"))).toBe(true)
      })
    })
  })

  describe("#given an all-blocked plan ([~] rows, remaining 0)", () => {
    describe("#when the turn ends", () => {
      it("#then nothing remains and no synthetic is emitted", async () => {
        const harness = harnessWithPlan(blockedPlanMarkdown())

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(0)
        expect(readBoulderWorkStatus(harness.dir)).toBe("completed")
      })
    })
  })

  describe("#given a corrupt boulder file", () => {
    describe("#when the turn ends", () => {
      it("#then it skips with a corrupt log and no synthetic", async () => {
        const harness = harnessWithCorruptBoulder()

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos.some((line) => line.includes("corrupt-state"))).toBe(true)
      })
    })
  })

  describe("#given a stop-phrase user message then a turn end", () => {
    describe("#when the gate evaluates", () => {
      it("#then the work disarms and no synthetic is emitted (B1)", async () => {
        const harness = harnessWithPlan(openPlanMarkdown())
        harness.session.messages = [userMessage("Pará.", 1000)]

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos.some((line) => line.includes("disarmed"))).toBe(true)
      })
    })
  })

  describe("#given a user-activity event inside the debounce window", () => {
    describe("#when the cancel arrives before the timer fires", () => {
      it("#then the pending steer is cancelled and no synthetic is emitted", async () => {
        const harness = harnessWithPlan(openPlanMarkdown())

        await harness.succeeded(SESSION_ID)
        await harness.push({ type: "session.inbox.delivered", data: { sessionID: SESSION_ID } })
        await harness.fire()

        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos.some((line) => line.includes("debounce-cancelled"))).toBe(true)
      })
    })
  })

  describe("#given a context-pressure signal in the transcript", () => {
    describe("#when the turn ends", () => {
      it("#then the pressure valve skips and no synthetic is emitted (B3)", async () => {
        const harness = harnessWithPlan(openPlanMarkdown())
        harness.session.messages = [compactionMessage(1000)]

        await harness.turn(SESSION_ID)

        expect(harness.synthetics).toHaveLength(0)
        expect(harness.infos.some((line) => line.includes("context-pressure"))).toBe(true)
      })
    })
  })
})
