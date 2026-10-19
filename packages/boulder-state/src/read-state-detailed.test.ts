/// <reference path="../../../bun-test.d.ts" />

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { getBoulderFilePath } from "./storage/path"
import { readBoulderState, readBoulderStateDetailed } from "./storage/read-state"
import { createBoulderState, writeBoulderState } from "./storage/write-state"

function createTempDirectory(): string {
  return mkdtempSync(join(tmpdir(), "boulder-read-detailed-"))
}

function writeRawState(directory: string, content: string): void {
  const boulderDirectory = join(directory, ".omo")
  mkdirSync(boulderDirectory, { recursive: true })
  writeFileSync(join(boulderDirectory, "boulder.json"), content, "utf-8")
}

const originalWarn = console.warn
const warnCalls: string[] = []

beforeEach(() => {
  warnCalls.length = 0
  console.warn = (...args: unknown[]) => {
    warnCalls.push(args.map((arg) => String(arg)).join(" "))
  }
})

afterEach(() => {
  console.warn = originalWarn
})

describe("readBoulderStateDetailed", () => {
  test("#given no state file #when reading detailed #then absent is returned and nothing is warned", () => {
    // given
    const directory = createTempDirectory()

    // when
    const result = readBoulderStateDetailed(directory)

    // then
    expect(result).toEqual({ status: "absent" })
    expect(warnCalls).toHaveLength(0)
  })

  test("#given a torn-write (partial json) #when reading detailed #then corrupt is diagnosed and legacy read returns null", () => {
    // given
    const directory = createTempDirectory()
    writeRawState(directory, "{ \"active_plan\": \".omo/plans/x.md\", \"session_ids\": [")
    const filePath = getBoulderFilePath(directory)

    // when
    const result = readBoulderStateDetailed(directory)
    const legacy = readBoulderState(directory)

    // then
    expect(result.status).toBe("corrupt")
    if (result.status !== "corrupt") throw new Error("expected corrupt")
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error.constructor.name).toBe("SyntaxError")
    expect(legacy).toBeNull()
    expect(warnCalls).toHaveLength(1)
    const message = warnCalls[0] ?? ""
    expect(message.startsWith(`[boulder-state] readBoulderState: corrupt state at ${filePath} (SyntaxError:`)).toBe(true)
    expect(message.endsWith(" - returning null")).toBe(true)
  })

  test("#given an empty object payload #when reading detailed #then corrupt is diagnosed as ValidationError", () => {
    // given
    const directory = createTempDirectory()
    writeRawState(directory, "{}")

    // when
    const result = readBoulderStateDetailed(directory)

    // then
    expect(result.status).toBe("corrupt")
    if (result.status !== "corrupt") throw new Error("expected corrupt")
    expect(result.error.constructor.name).toBe("ValidationError")
  })

  test("#given a valid state file #when reading detailed #then ok carries the parsed state", () => {
    // given
    const directory = createTempDirectory()
    const state = createBoulderState(".omo/plans/plan.md", "sess-1")
    writeBoulderState(directory, state)

    // when
    const result = readBoulderStateDetailed(directory)

    // then
    expect(result.status).toBe("ok")
    if (result.status !== "ok") throw new Error("expected ok")
    expect(result.state.plan_name).toBe(state.plan_name)
    expect(warnCalls).toHaveLength(0)
  })

  test("#given legacy read on a valid file #when reading #then no warning is emitted", () => {
    // given
    const directory = createTempDirectory()
    writeBoulderState(directory, createBoulderState(".omo/plans/plan.md", "sess-1"))

    // when
    const state = readBoulderState(directory)

    // then
    expect(state).not.toBeNull()
    expect(warnCalls).toHaveLength(0)
  })
})
