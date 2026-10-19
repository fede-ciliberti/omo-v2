import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import type { BoulderState, BoulderWorkState } from "@oh-my-opencode/boulder-state"
import { findWorkForSessionId, isContinuableStatus } from "./lookup"

/**
 * [OMC] v2 boulder-continuation lookup (task 5).
 *
 * Covers LOOKUP.md sections 2, 3, 6 and 7: closed prefix set with bare-suffix
 * compare, candidate ranking (opencode: > bare > codex: > senpi:), collision
 * resolution with the section 5.1 log line, read-only guarantees, and the
 * unknown-status mapping. Every fixture keeps the query session `ses_X` while
 * the stored work varies its `session_ids` form.
 */

let warnLines: string[]
const originalWarn = console.warn

beforeEach(() => {
  warnLines = []
  console.warn = (...args: unknown[]) => {
    warnLines.push(args.map((arg) => String(arg)).join(" "))
  }
})

afterEach(() => {
  console.warn = originalWarn
})

function makeWork(
  workId: string,
  sessionIds: string[],
  overrides: Partial<BoulderWorkState> = {},
): BoulderWorkState {
  return {
    work_id: workId,
    active_plan: "plan.md",
    plan_name: workId,
    status: "active",
    started_at: "2026-10-01T00:00:00.000Z",
    session_ids: sessionIds,
    ...overrides,
  }
}

function stateWithWorks(works: BoulderWorkState[]): BoulderState {
  const map: Record<string, BoulderWorkState> = {}
  for (const work of works) {
    map[work.work_id] = work
  }
  return {
    active_plan: "plan.md",
    plan_name: "plan",
    started_at: "2026-10-01T00:00:00.000Z",
    session_ids: [],
    works: map,
  }
}

describe("findWorkForSessionId", () => {
  describe("#given a work stored with a bare session id", () => {
    describe("#when the query is the bare id (fixture 1)", () => {
      it("#then it matches the work", () => {
        const work = makeWork("wk_1", ["ses_X"])
        expect(findWorkForSessionId(stateWithWorks([work]), "ses_X")).toBe(work)
      })
    })

    describe("#when the query carries the opencode: prefix (fixture 5)", () => {
      it("#then the cross-query matches the bare-stored work", () => {
        const work = makeWork("wk_1", ["ses_X"])
        expect(findWorkForSessionId(stateWithWorks([work]), "opencode:ses_X")).toBe(work)
      })
    })
  })

  describe("#given a work stored with an opencode: session id", () => {
    describe("#when the query is bare (fixture 2)", () => {
      it("#then the opencode: candidate matches", () => {
        const work = makeWork("wk_1", ["opencode:ses_X"])
        expect(findWorkForSessionId(stateWithWorks([work]), "ses_X")).toBe(work)
      })
    })
  })

  describe("#given a work stored with a codex: session id", () => {
    describe("#when the query is bare (fixture 3)", () => {
      it("#then the codex: candidate matches", () => {
        const work = makeWork("wk_1", ["codex:ses_X"])
        expect(findWorkForSessionId(stateWithWorks([work]), "ses_X")).toBe(work)
      })
    })
  })

  describe("#given a work stored with a senpi: session id", () => {
    describe("#when the query is bare (fixture 4)", () => {
      it("#then the senpi: candidate matches", () => {
        const work = makeWork("wk_1", ["senpi:ses_X"])
        expect(findWorkForSessionId(stateWithWorks([work]), "ses_X")).toBe(work)
      })
    })
  })

  describe("#given two works claim the same session with different forms (fixture 6)", () => {
    describe("#when the lookup resolves the collision", () => {
      it("#then the opencode: work wins and the section 5.1 line is logged", () => {
        const prefixed = makeWork("wk_prefixed", ["opencode:ses_X"])
        const bare = makeWork("wk_bare", ["ses_X"])
        const state = stateWithWorks([prefixed, bare])

        expect(findWorkForSessionId(state, "ses_X")).toBe(prefixed)
        expect(warnLines).toHaveLength(1)
        expect(warnLines[0]).toContain("session lookup collision for ses_X")
        expect(warnLines[0]).toContain("matched work_ids=[wk_prefixed, wk_bare]")
        expect(warnLines[0]).toContain("chosen work_id=wk_prefixed")
      })
    })
  })

  describe("#given two works claim the same session in the same form (fixture 7)", () => {
    describe("#when the lookup resolves the tie by updated_at", () => {
      it("#then the newer work wins and is logged", () => {
        const older = makeWork("wk_older", ["opencode:ses_X"], {
          updated_at: "2026-10-01T00:00:00.000Z",
        })
        const newer = makeWork("wk_newer", ["opencode:ses_X"], {
          updated_at: "2026-10-02T00:00:00.000Z",
        })

        expect(findWorkForSessionId(stateWithWorks([older, newer]), "ses_X")).toBe(newer)
        expect(warnLines).toHaveLength(1)
        expect(warnLines[0]).toContain("chosen work_id=wk_newer")
      })
    })
  })

  describe("#given a work whose ids do not match the query", () => {
    describe("#when the lookup misses (fixture 10)", () => {
      it("#then it returns null without logging", () => {
        const state = stateWithWorks([makeWork("wk_1", ["ses_other"])])
        expect(findWorkForSessionId(state, "ses_X")).toBeNull()
        expect(warnLines).toHaveLength(0)
      })
    })
  })

  describe("#given no work matches but the root mirror holds the session", () => {
    describe("#when the lookup falls back to the mirror", () => {
      it("#then it builds a legacy work from the mirror", () => {
        const state: BoulderState = {
          active_plan: "plan.md",
          plan_name: "plan",
          started_at: "2026-10-01T00:00:00.000Z",
          session_ids: ["ses_X"],
          works: { wk_1: makeWork("wk_1", ["ses_other"]) },
        }
        expect(findWorkForSessionId(state, "ses_X")?.work_id).toBe("plan-legacy")
      })
    })
  })

  describe("#given any state", () => {
    describe("#when the lookup runs", () => {
      it("#then it never mutates the state", () => {
        const state = stateWithWorks([
          makeWork("wk_prefixed", ["opencode:ses_X"]),
          makeWork("wk_bare", ["ses_X"]),
        ])
        const before = structuredClone(state)
        findWorkForSessionId(state, "ses_X")
        expect(state).toEqual(before)
      })
    })
  })
})

describe("isContinuableStatus", () => {
  describe("#given a status value", () => {
    describe("#when checking continuability", () => {
      it("#then active and paused are continuable", () => {
        expect(isContinuableStatus("active")).toBe(true)
        expect(isContinuableStatus("paused")).toBe(true)
      })

      it("#then completed and abandoned are not continuable", () => {
        expect(isContinuableStatus("completed")).toBe(false)
        expect(isContinuableStatus("abandoned")).toBe(false)
      })

      it("#then invented or missing statuses are not continuable", () => {
        expect(isContinuableStatus("awaiting-user-ok")).toBe(false)
        expect(isContinuableStatus(undefined)).toBe(false)
        expect(isContinuableStatus("whatever")).toBe(false)
      })
    })
  })
})
