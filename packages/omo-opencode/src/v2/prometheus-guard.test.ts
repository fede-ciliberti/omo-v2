import { describe, expect, it } from "bun:test"
import { isAllowedPrometheusFile } from "./tools"

const ROOT = "/workspace/project"

describe("isAllowedPrometheusFile (prometheus-md-only path policy)", () => {
  it("allows .md plan files under .omo/", () => {
    expect(isAllowedPrometheusFile(".omo/plans/foo.md", ROOT)).toBe(true)
    expect(isAllowedPrometheusFile("/workspace/project/.omo/plans/foo.md", ROOT)).toBe(true)
    expect(isAllowedPrometheusFile(".omo/plans/FOO.MD", ROOT)).toBe(true)
  })

  it("rejects product code outside .omo/", () => {
    expect(isAllowedPrometheusFile("src/foo.ts", ROOT)).toBe(false)
    expect(isAllowedPrometheusFile("package.json", ROOT)).toBe(false)
    expect(isAllowedPrometheusFile("foo.md", ROOT)).toBe(false)
  })

  it("rejects non-markdown files under .omo/", () => {
    expect(isAllowedPrometheusFile(".omo/plans/foo.ts", ROOT)).toBe(false)
  })

  it("rejects paths that escape the workspace", () => {
    expect(isAllowedPrometheusFile("../outside/.omo/foo.md", ROOT)).toBe(false)
    expect(isAllowedPrometheusFile("/etc/.omo/foo.md", ROOT)).toBe(false)
  })
})
