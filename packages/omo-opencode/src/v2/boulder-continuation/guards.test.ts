import { describe, expect, it } from "bun:test"
import {
  armDebounce,
  cooldownActive,
  DEBOUNCE_CANCEL_EVENTS,
  debounceDueAt,
  debounceIsDue,
  isDebounceCancelledBy,
  matchesRearmPhrase,
  matchesStopPhrase,
  REARM_PHRASE_PATTERN,
  shouldStopOnNoProgress,
  STOP_PHRASE_PATTERN,
} from "./guards"

/**
 * [OMC] v2 boulder-continuation guards unit tests (task 6).
 *
 * Pure-guard contract from SPEC.md sections 3.2, 3.3, 3.5, 3.7 and 7.
 * No timers, no event subscription: `now` is always passed in.
 */

describe("boulder-continuation guards — shouldStopOnNoProgress (SPEC 3.3)", () => {
  describe("#given consecutive_no_progress below the threshold", () => {
    it("#then 0 is not a stop", () => {
      expect(shouldStopOnNoProgress(0)).toBe(false)
    })

    it("#then 1 is not a stop", () => {
      expect(shouldStopOnNoProgress(1)).toBe(false)
    })
  })

  describe("#given consecutive_no_progress at or above the threshold", () => {
    it("#then 2 is a stop", () => {
      expect(shouldStopOnNoProgress(2)).toBe(true)
    })

    it("#then values above 2 are a stop", () => {
      expect(shouldStopOnNoProgress(3)).toBe(true)
      expect(shouldStopOnNoProgress(30)).toBe(true)
    })
  })
})

describe("boulder-continuation guards — cooldownActive (SPEC 3.2)", () => {
  describe("#given no previous injection", () => {
    it("#then the cooldown is not active", () => {
      expect(cooldownActive(null, 1_000_000)).toBe(false)
    })
  })

  describe("#given an injection less than 5000ms ago", () => {
    it("#then the cooldown is active", () => {
      expect(cooldownActive(1_000_000, 1_000_000)).toBe(true)
      expect(cooldownActive(1_000_000, 1_004_999)).toBe(true)
    })
  })

  describe("#given an injection at or beyond 5000ms ago", () => {
    it("#then the cooldown is not active", () => {
      expect(cooldownActive(1_000_000, 1_005_000)).toBe(false)
      expect(cooldownActive(1_000_000, 1_006_000)).toBe(false)
    })
  })
})

describe("boulder-continuation guards — debounce (SPEC 3.5)", () => {
  describe("#given the exact cancel-event set", () => {
    it("#then it holds the four normative V2 event names", () => {
      expect([...DEBOUNCE_CANCEL_EVENTS].sort()).toEqual(
        ["session.execution.started", "session.inbox.delivered", "session.inbox.enqueued", "tui.prompt.append"].sort(),
      )
    })

    it("#then each of the four events cancels the pending steer", () => {
      for (const eventName of DEBOUNCE_CANCEL_EVENTS) {
        expect(isDebounceCancelledBy(eventName)).toBe(true)
      }
    })

    it("#then an unrelated event does not cancel", () => {
      expect(isDebounceCancelledBy("session.execution.succeeded")).toBe(false)
      expect(isDebounceCancelledBy("session.status")).toBe(false)
      expect(isDebounceCancelledBy("")).toBe(false)
    })
  })

  describe("#given a debounce armed at a given time", () => {
    it("#then it is due at now + windowMs", () => {
      const armed = armDebounce(1_000_000, 5000)
      expect(debounceDueAt(armed)).toBe(1_005_000)
    })

    it("#then it is not due before the window and due at/after it", () => {
      const armed = armDebounce(1_000_000, 5000)
      expect(debounceIsDue(armed, 1_004_999)).toBe(false)
      expect(debounceIsDue(armed, 1_005_000)).toBe(true)
      expect(debounceIsDue(armed, 1_006_000)).toBe(true)
    })
  })
})

describe("boulder-continuation guards — matchesStopPhrase (SPEC 7.1)", () => {
  describe("#given a whole-message stop phrase", () => {
    it("#then voseo, punctuation and casing variants match", () => {
      expect(matchesStopPhrase("Pará")).toBe(true)
      expect(matchesStopPhrase("pará.")).toBe(true)
      expect(matchesStopPhrase("Stop")).toBe(true)
      expect(matchesStopPhrase("basta!")).toBe(true)
    })
  })

  describe("#given a sentence that merely starts with a stop word", () => {
    it("#then it does not match (anchor regression)", () => {
      expect(matchesStopPhrase("Para resolver esto hay que...")).toBe(false)
      expect(matchesStopPhrase("Alto consumo de memoria...")).toBe(false)
    })
  })

  describe("#given stop appearing mid-sentence", () => {
    it("#then it does not match", () => {
      expect(matchesStopPhrase("please stop doing that")).toBe(false)
    })
  })

  describe("#given an empty message", () => {
    it("#then it does not match", () => {
      expect(matchesStopPhrase("")).toBe(false)
    })
  })

  describe("#given the exported pattern", () => {
    it("#then it is anchored and carries the i/u/m flags", () => {
      expect(STOP_PHRASE_PATTERN.flags).toBe("imu")
      expect(STOP_PHRASE_PATTERN.source.startsWith("^")).toBe(true)
      expect(STOP_PHRASE_PATTERN.source.endsWith("$")).toBe(true)
    })
  })
})

describe("boulder-continuation guards — matchesRearmPhrase (SPEC 7.2)", () => {
  describe("#given a whole-message re-arm phrase", () => {
    it("#then accented and unaccented variants match", () => {
      expect(matchesRearmPhrase("Seguí.")).toBe(true)
      expect(matchesRearmPhrase("continuá")).toBe(true)
      expect(matchesRearmPhrase("resume")).toBe(true)
    })
  })

  describe("#given a sentence containing a re-arm word but not anchored", () => {
    it("#then it does not match", () => {
      expect(matchesRearmPhrase("Para continuar...")).toBe(false)
    })
  })

  describe("#given the exported pattern", () => {
    it("#then it is anchored and carries the i/u/m flags", () => {
      expect(REARM_PHRASE_PATTERN.flags).toBe("imu")
      expect(REARM_PHRASE_PATTERN.source.startsWith("^")).toBe(true)
      expect(REARM_PHRASE_PATTERN.source.endsWith("$")).toBe(true)
    })
  })
})
