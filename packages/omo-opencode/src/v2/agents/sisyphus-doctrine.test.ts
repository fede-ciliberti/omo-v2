import { describe, expect, test } from "bun:test"
import { DOCTRINE_SECTION_IDS, SISYPHUS_DOCTRINE_BASE } from "./sisyphus-doctrine"

const DEAD_IDENTIFIERS = [
  "call_omo_agent",
  "load_skills",
  "subagent_type",
  "run_in_background",
  "background_output",
  "background_task",
  "look_at",
]

describe("SISYPHUS_DOCTRINE_BASE", () => {
  test("every section id appears as a heading, in order", () => {
    // given the ordered id tuple and the body
    const positions = DOCTRINE_SECTION_IDS.map((id) => SISYPHUS_DOCTRINE_BASE.indexOf(`## ${id}`))

    // when checked
    // then no id is missing and each heading starts after the previous one
    expect(positions).not.toContain(-1)
    expect([...positions].sort((left, right) => left - right)).toEqual(positions)
  })

  test("the body names no primitive this harness does not expose", () => {
    // given the body
    // when searched for the dead identifiers the V1 surface used
    const found = DEAD_IDENTIFIERS.filter((identifier) => SISYPHUS_DOCTRINE_BASE.includes(identifier))

    // then none of them appear
    expect(found).toEqual([])
  })

  test("the body names the real delegation primitive", () => {
    // given the body
    // when the live delegation identifier is searched
    // then it is present, because a doctrine that names no delegation surface is worse than none
    expect(SISYPHUS_DOCTRINE_BASE.includes("subagent")).toBe(true)
  })
})
