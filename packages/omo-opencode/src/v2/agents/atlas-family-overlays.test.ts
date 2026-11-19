import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"
import { ATLAS_FAMILY_OPTIONS, ATLAS_FAMILY_OVERLAYS } from "./atlas-family-overlays"
import { FAMILY_IDS } from "./model-family"

const DOCTRINE_BUDGET = 12000
const ATLAS_DOCTRINE_MODULE = "./atlas-doctrine.ts"
/**
 * `ATLAS_DOCTRINE_BASE` is authored by todo 2 of this plan, which runs in
 * parallel with this one. When that module is present the budget is measured
 * against the real base; when it is absent the measurement falls back to this
 * reserved headroom (8000 -> 4000 for the overlays) and the test log says so.
 */
const ATLAS_BASE_RESERVED = 8000

type DoctrineModule = { ATLAS_DOCTRINE_BASE: string }

async function readDoctrineBase(): Promise<string | null> {
  const modulePath = new URL(ATLAS_DOCTRINE_MODULE, import.meta.url)
  if (!existsSync(fileURLToPath(modulePath))) return null
  const doctrine = (await import(ATLAS_DOCTRINE_MODULE)) as DoctrineModule
  return doctrine.ATLAS_DOCTRINE_BASE
}

const doctrineBase = await readDoctrineBase()

const NON_EMPTY_FAMILIES = [
  "kimi-k3",
  "kimi-k2-7",
  "kimi-k2-6",
  "gpt-5-5",
  "gpt-5-4",
  "claude-opus-4-7",
  "glm-5-2",
  "gemini",
] as const

const EMPTY_FAMILIES = ["claude-fable-5", "claude-opus-5", "claude-opus-4-8", "fallback"] as const

describe("ATLAS_FAMILY_OVERLAYS", () => {
  test("every family id is a key in both maps", () => {
    // given the shared family tuple
    const families = [...FAMILY_IDS].sort()

    // when both Atlas maps are inspected
    const overlayKeys = Object.keys(ATLAS_FAMILY_OVERLAYS).sort()
    const optionKeys = Object.keys(ATLAS_FAMILY_OPTIONS).sort()

    // then neither map misses a family and neither invents one
    expect(overlayKeys).toEqual(families)
    expect(optionKeys).toEqual(families)
  })

  test("the fallback family carries no delta", () => {
    // given the fallback family
    // when its overlay is read
    const overlay = ATLAS_FAMILY_OVERLAYS.fallback

    // then it is exactly the empty string
    expect(overlay).toBe("")
  })

  test("kimi-k3 is the kimi-k2-7 register, not a separate body", () => {
    // given the two Kimi families V1 builds from one register
    const k3 = ATLAS_FAMILY_OVERLAYS["kimi-k3"]
    const k27 = ATLAS_FAMILY_OVERLAYS["kimi-k2-7"]

    // when compared
    // then they are the same non-empty string
    expect(k3).toBe(k27)
    expect(k3.length).toBeGreaterThan(0)
  })

  test("gpt-5-4 reuses the gpt-5-5 calibration verbatim", () => {
    // given the two GPT families V1 builds from one calibration block
    const gpt54 = ATLAS_FAMILY_OVERLAYS["gpt-5-4"]
    const gpt55 = ATLAS_FAMILY_OVERLAYS["gpt-5-5"]

    // when compared
    // then they are the same non-empty string
    expect(gpt54).toBe(gpt55)
    expect(gpt54.length).toBeGreaterThan(0)
  })

  test("six distinct deltas across the eight non-empty entries, four empty ids", () => {
    // given every family's overlay
    // when the non-empty ones are collected
    const nonEmpty = FAMILY_IDS.filter((family) => ATLAS_FAMILY_OVERLAYS[family].length > 0)
    const distinct = new Set(nonEmpty.map((family) => ATLAS_FAMILY_OVERLAYS[family]))

    // then exactly the eight delta families are populated, as six distinct bodies
    expect([...nonEmpty].sort()).toEqual([...NON_EMPTY_FAMILIES].sort())
    expect(distinct.size).toBe(6)
    expect([...distinct].every((overlay) => overlay.trim().length > 0)).toBe(true)
    expect(EMPTY_FAMILIES.filter((family) => ATLAS_FAMILY_OVERLAYS[family] === "").length).toBe(
      EMPTY_FAMILIES.length,
    )
  })

  test("no overlay carries a generation field or a thinking/reasoning key", () => {
    // given every overlay and the key spellings this module must never emit
    const forbidden = ["maxTokens", "thinking:", "reasoning:", "reasoningEffort:"]

    // when each overlay is scanned
    const hits = FAMILY_IDS.flatMap((family) =>
      forbidden
        .filter((token) => ATLAS_FAMILY_OVERLAYS[family].includes(token))
        .map((token) => `${family}:${token}`),
    )

    // then the mode-specific text never smuggles a generation setting
    expect(hits).toEqual([])
  })

  test("base plus all overlays stays within the 12000 character budget", () => {
    // given the doctrine base (real when authored, reserved otherwise) and every overlay
    const baseLength = doctrineBase === null ? ATLAS_BASE_RESERVED : doctrineBase.length
    const overlayTotal = FAMILY_IDS.reduce(
      (total, family) => total + ATLAS_FAMILY_OVERLAYS[family].length,
      0,
    )
    const assembled = baseLength + overlayTotal

    // when the assembled doctrine is measured
    console.log(
      `atlas budget: base=${baseLength}${doctrineBase === null ? " (reserved)" : ""} overlays=${overlayTotal} total=${assembled} budget=${DOCTRINE_BUDGET}`,
    )

    // then the hard budget holds
    expect(assembled).toBeLessThanOrEqual(DOCTRINE_BUDGET)
  })
})

describe("ATLAS_FAMILY_OPTIONS", () => {
  test("every family runs at temperature 0.1 and nothing else", () => {
    // given every family's options entry, in family order
    const entries = FAMILY_IDS.map((family) => ATLAS_FAMILY_OPTIONS[family])

    // when compared to the V1 Atlas generation parity
    // then each one is exactly the temperature, with no maxTokens or thinking object
    expect(entries).toEqual(FAMILY_IDS.map(() => ({ temperature: 0.1 })))
    expect(new Set(FAMILY_IDS).size).toBe(12)
  })
})
