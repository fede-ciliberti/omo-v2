import { describe, expect, it } from "bun:test"
import type { PlanChecklist } from "@oh-my-opencode/boulder-state"
import {
  applyBackoffExpiry,
  createWorkCounterState,
  disarm,
  progressSignature,
  rearm,
  recordFailure,
  recordSteer,
  resetFailuresOnAdmission,
  resetOnProgress,
  shouldStopOnBackoff,
  shouldStopOnCap,
  STEER_CAP,
  type WorkCounterState,
} from "./signature"

/**
 * [OMC] v2 boulder-continuation signature + counters (task 4).
 *
 * Pure transitions and progress signature per SPEC sections 1, 2, 3.1, 3.4, 6.
 * No timers, no global clock: every transition that needs time takes `now`.
 */

type ChecklistWithUpdatedAt = PlanChecklist & { updated_at: string }

function checklist(
  completed: number,
  total: number,
  updated_at = "2026-10-17T00:00:00.000Z",
): ChecklistWithUpdatedAt {
  return { completed, total, remaining: total - completed, nextTaskLabel: null, updated_at }
}

describe("progressSignature", () => {
  // given a work and a checklist
  it("returns '<work_id>:<completed>/<total>'", () => {
    expect(progressSignature("wk_1a2b", checklist(3, 9))).toBe("wk_1a2b:3/9")
  })

  it("output contains no ISO date and no 'updated_at'", () => {
    const signature = progressSignature("wk_1a2b", checklist(3, 9))
    expect(signature).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(signature).not.toContain("updated_at")
    expect(signature).not.toContain("2026")
  })

  it("two checklists with different updated_at but same counts share a signature", () => {
    const a = progressSignature("wk_1a2b", checklist(3, 9, "2026-01-01T00:00:00.000Z"))
    const b = progressSignature("wk_1a2b", checklist(3, 9, "2026-10-17T12:34:56.789Z"))
    expect(a).toBe(b)
  })
})

describe("recordSteer", () => {
  it("first steer sets signature, clears no-progress and counts the steer", () => {
    const next = recordSteer(createWorkCounterState(), "wk_1:0/3", 1000)
    expect(next.signature).toBe("wk_1:0/3")
    expect(next.consecutive_no_progress).toBe(0)
    expect(next.steers_total).toBe(1)
    expect(next.last_injected_at).toBe(1000)
  })

  it("same signature increments consecutive_no_progress", () => {
    const first = recordSteer(createWorkCounterState(), "wk_1:0/3", 1000)
    const second = recordSteer(first, "wk_1:0/3", 2000)
    expect(second.consecutive_no_progress).toBe(1)
    expect(second.steers_total).toBe(2)
    expect(second.signature).toBe("wk_1:0/3")
  })

  it("different signature resets consecutive_no_progress and updates signature", () => {
    const first = recordSteer(createWorkCounterState(), "wk_1:0/3", 1000)
    const stuck = recordSteer(first, "wk_1:0/3", 2000)
    const moved = recordSteer(stuck, "wk_1:1/3", 3000)
    expect(moved.consecutive_no_progress).toBe(0)
    expect(moved.signature).toBe("wk_1:1/3")
    expect(moved.steers_total).toBe(3)
  })

  it("at the cap returns a state where shouldStopOnCap is true", () => {
    const atCap: WorkCounterState = { ...createWorkCounterState(), steers_total: STEER_CAP }
    const next = recordSteer(atCap, "wk_1:1/3", 1000)
    expect(next.steers_total).toBe(STEER_CAP + 1)
    expect(shouldStopOnCap(next)).toBe(true)
  })
})

describe("recordFailure", () => {
  it("increments prompt_failures, sets last_failure_at, leaves steers_total", () => {
    const steered = recordSteer(createWorkCounterState(), "wk_1:0/3", 1000)
    const failed = recordFailure(steered, 2000)
    expect(failed.prompt_failures).toBe(1)
    expect(failed.last_failure_at).toBe(2000)
    expect(failed.steers_total).toBe(steered.steers_total)
    expect(failed.signature).toBe(steered.signature)
  })
})

describe("shouldStopOnBackoff / applyBackoffExpiry", () => {
  it("stops within the 5 minute window", () => {
    const state: WorkCounterState = {
      ...createWorkCounterState(),
      prompt_failures: 10,
      last_failure_at: 1_000_000,
    }
    expect(shouldStopOnBackoff(state, 1_000_000 + 299_999)).toBe(true)
  })

  it("expires and resets prompt_failures after 5 minutes", () => {
    const state: WorkCounterState = {
      ...createWorkCounterState(),
      prompt_failures: 10,
      last_failure_at: 1_000_000,
    }
    const expired = 1_000_000 + 300_000
    expect(shouldStopOnBackoff(state, expired)).toBe(false)
    const reset = applyBackoffExpiry(state, expired)
    expect(reset.prompt_failures).toBe(0)
    expect(reset.last_failure_at).toBe(state.last_failure_at)
  })

  it("applyBackoffExpiry is a no-op before the window elapses", () => {
    const state: WorkCounterState = {
      ...createWorkCounterState(),
      prompt_failures: 10,
      last_failure_at: 1_000_000,
    }
    expect(applyBackoffExpiry(state, 1_000_000 + 1).prompt_failures).toBe(10)
  })

  it("is not active with no recorded failure", () => {
    expect(shouldStopOnBackoff(createWorkCounterState(), 9_999_999)).toBe(false)
  })
})

describe("resetOnProgress", () => {
  it("clears consecutive_no_progress but preserves steers_total", () => {
    const stuck: WorkCounterState = {
      ...createWorkCounterState(),
      steers_total: 5,
      consecutive_no_progress: 2,
      signature: "wk_1:0/3",
    }
    const moved = resetOnProgress(stuck, "wk_1:1/3")
    expect(moved.consecutive_no_progress).toBe(0)
    expect(moved.signature).toBe("wk_1:1/3")
    expect(moved.steers_total).toBe(5)
  })
})

describe("disarm / rearm", () => {
  it("toggles the flag without touching steers_total", () => {
    const state: WorkCounterState = { ...createWorkCounterState(), steers_total: 7 }
    const disarmed = disarm(state)
    expect(disarmed.disarmed).toBe(true)
    expect(disarmed.steers_total).toBe(7)
    const rearmed = rearm(disarmed)
    expect(rearmed.disarmed).toBe(false)
    expect(rearmed.steers_total).toBe(7)
  })
})

describe("resetFailuresOnAdmission", () => {
  it("sets prompt_failures to 0", () => {
    const state: WorkCounterState = {
      ...createWorkCounterState(),
      prompt_failures: 4,
      last_failure_at: 500,
    }
    const reset = resetFailuresOnAdmission(state)
    expect(reset.prompt_failures).toBe(0)
    expect(reset.last_failure_at).toBe(500)
  })
})
