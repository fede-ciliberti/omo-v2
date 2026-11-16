import { describe, expect, test } from "bun:test"
import { composeDoctrine } from "./doctrine-hook"
import { FAMILY_IDS } from "./model-family"
import { FAMILY_OPTIONS, FAMILY_OVERLAYS } from "./family-overlays"
import { SISYPHUS_DOCTRINE_BASE } from "./sisyphus-doctrine"

const ALLOWED_OPTION_KEYS = new Set(["maxTokens", "temperature", "topP", "topK"])

describe("FAMILY_OVERLAYS", () => {
  test("fallback carries no delta", () => {
    // given the fallback family
    // when its overlay is read
    const overlay = FAMILY_OVERLAYS.fallback

    // then it is exactly the empty string
    expect(overlay).toBe("")
  })

  test("every family has an overlay, and only the fallback is empty", () => {
    // given the family tuple
    // when each overlay is inspected
    const empty = FAMILY_IDS.filter((family) => FAMILY_OVERLAYS[family] === "")

    // then every family is present and only fallback is empty
    expect(Object.keys(FAMILY_OVERLAYS).sort()).toEqual([...FAMILY_IDS].sort())
    expect(empty).toEqual(["fallback"])
  })

  test("fable reuses the opus-4-8 overlay verbatim", () => {
    // given the two families V1 builds from one body
    const fable = FAMILY_OVERLAYS["claude-fable-5"]
    const opus48 = FAMILY_OVERLAYS["claude-opus-4-8"]

    // when compared
    // then they are the same string, not two authored copies
    expect(fable).toBe(opus48)
    expect(fable.length).toBeGreaterThan(0)
  })

  test("the opus-5 counter-doctrine is a distinct delta the base does not embed", () => {
    // given the opus-5 overlay, the base doctrine and the other non-empty deltas
    const overlay = FAMILY_OVERLAYS["claude-opus-5"]
    const otherDeltas = FAMILY_IDS.filter(
      (family) => family !== "claude-opus-5" && family !== "fallback",
    ).map((family) => FAMILY_OVERLAYS[family])

    // when compared
    // then it is a real string, the base does not swallow it, and no other family shares it
    expect(overlay.length).toBeGreaterThan(0)
    expect(SISYPHUS_DOCTRINE_BASE.includes(overlay)).toBe(false)
    expect(otherDeltas).not.toContain(overlay)
  })

  test("the composed doctrine differs between an overlay family and the fallback", () => {
    // given one model per side of the D1 decision
    const opus = composeDoctrine("anthropic/claude-opus-5")
    const fallback = composeDoctrine("vllm/deepseek-v4.1-flash-pool")

    // when both are assembled for the request
    // then the opus-5 request carries strictly more doctrine than the fallback one
    expect(fallback).toBe(SISYPHUS_DOCTRINE_BASE)
    expect(opus.length).toBeGreaterThan(fallback.length)
  })

  test("base plus overlays stays within the 12000 character budget", () => {
    // given the base doctrine and every overlay, counted once per family
    const overlayTotal = FAMILY_IDS.reduce(
      (total, family) => total + FAMILY_OVERLAYS[family].length,
      0,
    )

    // when the assembled doctrine is measured
    const assembled = SISYPHUS_DOCTRINE_BASE.length + overlayTotal

    // then the hard budget holds
    expect(assembled).toBeLessThanOrEqual(12000)
  })
})

describe("FAMILY_OPTIONS", () => {
  test("every family has an options entry", () => {
    // given the family tuple
    // when the options map is inspected
    const keys = Object.keys(FAMILY_OPTIONS).sort()

    // then the key set is exactly the family set
    expect(keys).toEqual([...FAMILY_IDS].sort())
  })

  test("options carry only the allowlisted generation fields", () => {
    // given every family's options
    const entries = FAMILY_IDS.map((family) => [family, FAMILY_OPTIONS[family]] as const)

    // when each entry's keys are collected
    const unknownKeys = entries.flatMap(([family, options]) =>
      Object.keys(options)
        .filter((key) => !ALLOWED_OPTION_KEYS.has(key))
        .map((key) => `${family}:${key}`),
    )

    // then no entry carries a thinking or reasoning object, or any other key
    expect(unknownKeys).toEqual([])
  })
})
