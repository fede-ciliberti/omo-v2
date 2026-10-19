import { describe, expect, it } from "bun:test"
import type { SessionMessageInfo } from "@opencode/client"
import {
  CONTEXT_PRESSURE_MARKERS,
  EXTERNAL_BLOCKER_MARKER,
  hasAllowedExternalBlockerMarker,
  PRESSURE_SCAN_LIMIT,
  transcriptHasContextPressureMarker,
} from "./markers"

/**
 * [OMC] v2 boulder-continuation markers and context-pressure valve (task 7).
 *
 * Asserts the machine-consumed booleans of DIRECTIVE.md sections 2, 3.1 and 3.3
 * only; never the authored prose of the directive.
 */

function assistantText(text: string): SessionMessageInfo {
  return {
    id: "msg_assistant",
    type: "assistant",
    agent: "build",
    model: { id: "test", providerID: "test" },
    time: { created: 1 },
    content: [{ type: "text", text }],
  }
}

function assistantWithLength(): SessionMessageInfo {
  return {
    id: "msg_assistant_len",
    type: "assistant",
    agent: "build",
    model: { id: "test", providerID: "test" },
    time: { created: 1 },
    content: [{ type: "text", text: "cut off" }],
    finish: "length",
  }
}

function userMessage(text: string): SessionMessageInfo {
  return { id: "msg_user", type: "user", time: { created: 1 }, text }
}

function completedCompaction(): SessionMessageInfo {
  return {
    id: "msg_compaction",
    type: "compaction",
    time: { created: 1 },
    status: "completed",
    reason: "auto",
    summary: "summary",
    recent: "recent",
  }
}

function cleanAssistant(): SessionMessageInfo {
  return assistantText("all good, moving on")
}

describe("hasAllowedExternalBlockerMarker", () => {
  it("returns false for an undefined message", () => {
    expect(hasAllowedExternalBlockerMarker(undefined)).toBe(false)
  })

  it("returns false when the marker stands alone", () => {
    expect(hasAllowedExternalBlockerMarker(EXTERNAL_BLOCKER_MARKER)).toBe(false)
  })

  it("returns false when only blank lines follow the marker", () => {
    expect(hasAllowedExternalBlockerMarker(`${EXTERNAL_BLOCKER_MARKER}\n   \n\t`)).toBe(false)
  })

  it("returns true when the marker is the first line and blocker text follows", () => {
    expect(hasAllowedExternalBlockerMarker(`${EXTERNAL_BLOCKER_MARKER}\nmissing credential`)).toBe(true)
  })

  it("returns false when the marker is not the first line", () => {
    expect(hasAllowedExternalBlockerMarker(`context line\n${EXTERNAL_BLOCKER_MARKER}\nblocker text`)).toBe(false)
  })

  it("returns false when the first line merely contains the marker", () => {
    expect(hasAllowedExternalBlockerMarker(`see ${EXTERNAL_BLOCKER_MARKER}\nblocker text`)).toBe(false)
  })

  it("returns false for the dropped second-line variant after an ultrawork opener", () => {
    expect(
      hasAllowedExternalBlockerMarker(`ULTRAWORK MODE ENABLED!\n${EXTERNAL_BLOCKER_MARKER}\nblocker text`),
    ).toBe(false)
  })
})

describe("transcriptHasContextPressureMarker", () => {
  it("returns false for a clean transcript", () => {
    expect(transcriptHasContextPressureMarker([cleanAssistant(), userMessage("keep going")])).toBe(false)
  })

  it("returns false for an empty transcript", () => {
    expect(transcriptHasContextPressureMarker([])).toBe(false)
  })

  it("detects each retained substring case-insensitively", () => {
    for (const marker of CONTEXT_PRESSURE_MARKERS) {
      expect(transcriptHasContextPressureMarker([userMessage(marker.toUpperCase())])).toBe(true)
    }
  })

  it("detects a completed compaction entry", () => {
    expect(transcriptHasContextPressureMarker([cleanAssistant(), completedCompaction()])).toBe(true)
  })

  it("detects an assistant entry that finished with length", () => {
    expect(transcriptHasContextPressureMarker([assistantWithLength()])).toBe(true)
  })

  it("ignores a completed compaction outside the scan window", () => {
    const outside = completedCompaction()
    const clean = Array.from({ length: PRESSURE_SCAN_LIMIT }, () => cleanAssistant())
    expect(transcriptHasContextPressureMarker([outside, ...clean])).toBe(false)
  })

  it("ignores a compaction that did not complete", () => {
    const running: SessionMessageInfo = {
      id: "msg_compaction_running",
      type: "compaction",
      time: { created: 1 },
      status: "running",
      reason: "auto",
      summary: "in progress",
      recent: "in progress",
    }
    expect(transcriptHasContextPressureMarker([running])).toBe(false)
  })
})
