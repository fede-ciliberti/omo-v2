import { describe, expect, it } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { findSgBinarySync } from "@oh-my-opencode/utils"
import { runAstGrep } from "./tools"

const hasSgBinary = findSgBinarySync() !== null

function withFixture(content: string, run: (directory: string) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), "omo-ast-grep-"))
  writeFileSync(join(directory, "sample.ts"), content)
  return run(directory).finally(() => {
    rmSync(directory, { recursive: true, force: true })
  })
}

describe("ast_grep_search", () => {
  it.skipIf(!hasSgBinary)("finds a structural match and reports file:line:column", async () => {
    await withFixture("function hello(name: string) {\n  return name\n}\n", async (directory) => {
      const output = await runAstGrep(
        { pattern: "function $NAME($$$ARGS) { $$$BODY }", lang: "ts", path: "." },
        directory,
      )

      expect(output).toContain("1 structural match(es)")
      expect(output).toContain("sample.ts:1:1")
      expect(output).toContain("function hello(name: string) {")
    })
  })

  it.skipIf(!hasSgBinary)("reports absence explicitly instead of returning an empty string", async () => {
    await withFixture("const x = 1\n", async (directory) => {
      const output = await runAstGrep(
        { pattern: "function $NAME($$$ARGS) { $$$BODY }", lang: "ts", path: "." },
        directory,
      )

      expect(output).toContain("No structural matches")
    })
  })

  it.skipIf(!hasSgBinary)("previews a rewrite without modifying the file", async () => {
    const original = "const x = 1\n"
    await withFixture(original, async (directory) => {
      const output = await runAstGrep(
        { pattern: "const $A = $B", lang: "ts", path: ".", rewrite: "let $A = $B" },
        directory,
      )

      expect(output).toContain("DRY RUN")
      expect(output).toContain("let x = 1")
      expect(readFileSync(join(directory, "sample.ts"), "utf8")).toBe(original)
    })
  })

  it.skipIf(!hasSgBinary)("caps the number of returned matches", async () => {
    const body = Array.from({ length: 5 }, (_, index) => `const value${index} = ${index}\n`).join("")
    await withFixture(body, async (directory) => {
      const output = await runAstGrep(
        { pattern: "const $A = $B", lang: "ts", path: ".", max_matches: 2 },
        directory,
      )

      expect(output).toContain("output truncated to 2 of 5 matches")
    })
  })
})
