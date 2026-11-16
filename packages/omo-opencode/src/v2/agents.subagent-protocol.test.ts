import { describe, expect, test } from "bun:test"
import { OMC_AGENTS } from "./agents"

// Identifier facts only: a prompt that names a primitive the harness does not
// expose is a runtime hazard, and so is a delegating prompt that names none.
const DEAD_DELEGATION_IDENTIFIERS = [
  "call_omo_agent",
  "subagent_type",
  "load_skills",
  "background_output",
] as const

const DELEGATING_AGENT_IDS = ["metis", "sisyphus-junior"] as const

function systemFor(id: string): string {
  const found = OMC_AGENTS.find((agent) => agent.id === id)
  if (found === undefined) {
    throw new Error(`unknown agent definition: ${id}`)
  }
  return found.system
}

describe("agents subagent protocol", () => {
  for (const id of DELEGATING_AGENT_IDS) {
    describe(`#given the ${id} agent definition`, () => {
      describe("#when its system prompt is assembled", () => {
        test("#then it names the live subagent primitive", () => {
          // given
          const system = systemFor(id)

          // when
          const namesLivePrimitive = system.includes("subagent(")

          // then
          expect(namesLivePrimitive).toBe(true)
        })

        test("#then it names none of the dead delegation identifiers", () => {
          // given
          const system = systemFor(id)

          // when
          const deadIdentifiers = DEAD_DELEGATION_IDENTIFIERS.filter((identifier) =>
            system.includes(identifier),
          )

          // then
          expect(deadIdentifiers).toEqual([])
        })
      })
    })
  }
})
