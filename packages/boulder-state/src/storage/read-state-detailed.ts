import { existsSync, readFileSync } from "node:fs"

import type { BoulderState } from "../types"
import { normalizeState } from "./normalize-state"
import { getBoulderFilePath } from "./path"
import { projectWorkToMirror, selectMirrorWork } from "./shared"

export type BoulderStateReadResult =
  | { status: "ok"; state: BoulderState }
  | { status: "absent" }
  | { status: "corrupt"; error: Error }

class ValidationError extends Error {}

export function readBoulderStateDetailed(directory: string): BoulderStateReadResult {
  return readBoulderStateResult(directory, true)
}

/** Silent variant used by the legacy `readBoulderState`; never warns. */
export function readBoulderStateQuiet(directory: string): BoulderState | null {
  const result = readBoulderStateResult(directory, false)
  return result.status === "ok" ? result.state : null
}

function readBoulderStateResult(directory: string, warnOnCorrupt: boolean): BoulderStateReadResult {
  const filePath = getBoulderFilePath(directory)
  if (!existsSync(filePath)) {
    // Debug-level line from LOOKUP.md §4.1; absent is a silent (no-warn) contract.
    debugAbsent(filePath)
    return { status: "absent" }
  }

  try {
    const content = readFileSync(filePath, "utf-8")
    return { status: "ok", state: parseBoulderStateContent(content) }
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error))
    if (warnOnCorrupt) {
      console.warn(
        `[boulder-state] readBoulderState: corrupt state at ${filePath} (${normalizedError.constructor.name}: ${normalizedError.message}) - returning null`,
      )
    }
    return { status: "corrupt", error: normalizedError }
  }
}

function parseBoulderStateContent(content: string): BoulderState {
  const parsed: unknown = JSON.parse(content)
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length === 0) {
    throw new ValidationError("invalid boulder state payload")
  }

  const record = parsed as Record<string, unknown>
  normalizeState(record)
  const state = parsed as BoulderState
  const mirrorWork = selectMirrorWork(state)
  if (mirrorWork) {
    state.active_work_id = mirrorWork.work_id
    projectWorkToMirror(state, mirrorWork)
  }

  return state
}

function debugAbsent(filePath: string): void {
  if (process.env.OMO_BOULDER_DEBUG === "1") {
    console.debug(`[boulder-state] readBoulderState: no state file at ${filePath}`)
  }
}
