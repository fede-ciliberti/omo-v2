/**
 * [OMC] v2 boulder-continuation markers and context-pressure valve (task 7).
 *
 * Ports of the Light edition's Stop-hook guards, adapted to the OpenCode
 * harness per DIRECTIVE.md sections 2, 2.1, 3.1 and 3.3:
 * - the external-blocker marker is recognized ONLY as the exact first line with
 *   non-empty text after it (the second-line variant is dropped, section 2.1);
 * - the context-pressure valve keeps the three host-agnostic substrings and adds
 *   the V2-native compaction / finish-length signals read from `message.list`.
 */

import type { SessionMessageInfo } from "@opencode/client"

/** DIRECTIVE.md section 2: exact first-line marker that ends a turn. */
export const EXTERNAL_BLOCKER_MARKER = "<ulw-execute-blocked-external>"

/** DIRECTIVE.md section 3.1: retained host-agnostic context-pressure substrings. */
export const CONTEXT_PRESSURE_MARKERS = [
  "context_length_exceeded",
  "context_too_large",
  "context compacted",
] as const

/** DIRECTIVE.md section 3.3: how many trailing transcript entries are scanned. */
export const PRESSURE_SCAN_LIMIT = 20

/**
 * DIRECTIVE.md section 2: the marker stops the continuation only when it is the
 * exact first line (after trim) AND at least one later line carries non-empty
 * blocker text. A bare echo of the marker never skips the guard.
 */
export function hasAllowedExternalBlockerMarker(lastAssistantMessage: string | undefined): boolean {
  if (lastAssistantMessage === undefined) {
    return false
  }
  const lines = lastAssistantMessage.split("\n")
  const firstLine = lines[0] ?? ""
  if (firstLine.trim() !== EXTERNAL_BLOCKER_MARKER) {
    return false
  }
  return lines.slice(1).some((line) => line.trim() !== "")
}

function messageText(message: SessionMessageInfo): string {
  switch (message.type) {
    case "assistant":
      return message.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
    case "user":
      return message.text
    case "compaction":
      if (message.status === "failed") {
        return ""
      }
      return `${message.summary} ${message.recent}`
    default:
      return ""
  }
}

/**
 * DIRECTIVE.md sections 3.1 and 3.3: context pressure is present when, within
 * the last `PRESSURE_SCAN_LIMIT` transcript entries, a compaction completed, an
 * assistant turn finished with `finish: "length"`, or the concatenated text
 * carries one of the retained substrings (case-insensitive).
 */
export function transcriptHasContextPressureMarker(messages: SessionMessageInfo[]): boolean {
  const window = messages.slice(-PRESSURE_SCAN_LIMIT)

  for (const message of window) {
    if (message.type === "compaction" && message.status === "completed") {
      return true
    }
    if (message.type === "assistant" && message.finish === "length") {
      return true
    }
  }

  const text = window.map(messageText).join("\n").toLowerCase()
  return CONTEXT_PRESSURE_MARKERS.some((marker) => text.includes(marker))
}
