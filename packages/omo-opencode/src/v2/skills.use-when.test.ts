import { describe, expect, it } from "bun:test"
import { parseSkillFrontmatter, renderSkillDescription } from "./skills"

describe("parseSkillFrontmatter use_when", () => {
  it("parses a plain use_when scalar alongside name and description", () => {
    const parsed = parseSkillFrontmatter(
      ["---", "name: demo", "description: Does demo things.", "use_when: the task touches demo", "---", "", "# Demo"].join(
        "\n",
      ),
    )

    expect(parsed).toEqual({
      name: "demo",
      description: "Does demo things.",
      use_when: "the task touches demo",
    })
  })

  it("parses a folded block scalar for use_when", () => {
    const parsed = parseSkillFrontmatter(
      ["---", "name: demo", "use_when: >-", "  the task touches demo", "  or mentions demo", "---"].join("\n"),
    )

    expect(parsed.use_when).toBe("the task touches demo or mentions demo")
  })

  it("omits use_when when the frontmatter does not declare it", () => {
    const parsed = parseSkillFrontmatter(["---", "name: demo", "---"].join("\n"))

    expect(parsed.use_when).toBeUndefined()
    expect("use_when" in parsed).toBe(false)
  })
})

describe("renderSkillDescription", () => {
  it("promotes the activation condition to the front of the catalog description", () => {
    expect(renderSkillDescription("Does demo things.", "the task touches demo")).toBe(
      "MANDATORY — call this skill when: the task touches demo Does demo things.",
    )
  })

  it("keeps the description untouched when no condition is declared", () => {
    expect(renderSkillDescription("Does demo things.", undefined)).toBe("Does demo things.")
  })

  it("renders the condition alone when the description is empty", () => {
    expect(renderSkillDescription(undefined, "the task touches demo")).toBe(
      "MANDATORY — call this skill when: the task touches demo",
    )
    expect(renderSkillDescription("  ", "  ")).toBeUndefined()
  })
})
