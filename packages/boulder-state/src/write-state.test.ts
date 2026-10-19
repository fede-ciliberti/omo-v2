/// <reference path="../../../bun-test.d.ts" />

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"

import { writeFileAtomicSync } from "./storage/atomic-write"
import { getBoulderFilePath } from "./storage/path"
import { createBoulderState, writeBoulderState } from "./storage/write-state"

function createTempDirectory(): string {
  return mkdtempSync(join(tmpdir(), "boulder-write-state-"))
}

describe("writeFileAtomicSync", () => {
  test("#given 50 concurrent writes to the same path #when all complete #then the target always parses as valid JSON", async () => {
    // given
    const directory = createTempDirectory()
    const filePath = join(directory, "state.json")
    const payloads = Array.from({ length: 50 }, (_, index) => JSON.stringify({ index, payload: "x".repeat(256) }))

    // when
    await Promise.all(payloads.map(async (payload) => {
      await Promise.resolve()
      writeFileAtomicSync(filePath, payload)
    }))

    // then
    const content = readFileSync(filePath, "utf-8")
    const parsed: unknown = JSON.parse(content)
    expect(parsed).toBeObject()
    expect(payloads).toContain(content)
  })

  test("#given a write #when it completes #then no temp file is left behind", () => {
    // given
    const directory = createTempDirectory()
    const filePath = join(directory, "state.json")

    // when
    writeFileAtomicSync(filePath, "{}")

    // then
    expect(readdirSync(directory)).toEqual(["state.json"])
  })

  test("#given an existing target #when it is rewritten #then the inode changes (rename, not in-place truncate)", () => {
    // given
    const directory = createTempDirectory()
    const filePath = join(directory, "state.json")
    writeFileAtomicSync(filePath, "{\"first\": true}")
    const inodeBefore = statSync(filePath).ino

    // when
    writeFileAtomicSync(filePath, "{\"second\": true}")

    // then
    expect(statSync(filePath).ino).not.toBe(inodeBefore)
    expect(JSON.parse(readFileSync(filePath, "utf-8"))).toEqual({ second: true })
  })
})

describe("writeBoulderState atomic write", () => {
  test("#given 50 concurrent state writes #when all complete #then the boulder file always parses as valid JSON", async () => {
    // given
    const directory = createTempDirectory()
    mkdirSync(join(directory, ".omo"), { recursive: true })
    const states = Array.from({ length: 50 }, (_, index) =>
      createBoulderState(`.omo/plans/plan-${index}.md`, `sess-${index}`),
    )

    // when
    await Promise.all(states.map(async (state) => {
      await Promise.resolve()
      writeBoulderState(directory, state)
    }))

    // then
    const content = readFileSync(getBoulderFilePath(directory), "utf-8")
    const parsed: unknown = JSON.parse(content)
    expect(parsed).toBeObject()
    expect(readdirSync(join(directory, ".omo")).filter((entry) => entry.endsWith(".tmp"))).toHaveLength(0)
  })

  test("#given an existing boulder file #when the state is rewritten #then the file is replaced by rename", () => {
    // given
    const directory = createTempDirectory()
    const state = createBoulderState(".omo/plans/plan.md", "sess-1")
    writeBoulderState(directory, state)
    const filePath = getBoulderFilePath(directory)
    const inodeBefore = statSync(filePath).ino

    // when
    const written = writeBoulderState(directory, state)

    // then
    expect(written).toBe(true)
    expect(statSync(filePath).ino).not.toBe(inodeBefore)
  })
})
