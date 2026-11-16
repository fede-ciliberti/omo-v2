import { describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createLspServerConfig } from "./mcp"

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..", "..")

describe("createLspServerConfig", () => {
  it("honours a complete environment pair and forwards both values", () => {
    // given
    const env = { OMO_LSP_DAEMON_CLI: "/opt/daemon/dist/cli.js", OMO_LSP_DAEMON_VERSION: "9.9.9" }

    // when
    const config = createLspServerConfig(env, REPO_ROOT)

    // then
    expect(config.enabled).toBe(true)
    expect(config.command).toEqual(["/opt/daemon/dist/cli.js", "mcp"])
    expect(config.environment).toEqual({
      OMO_LSP_DAEMON_CLI: "/opt/daemon/dist/cli.js",
      OMO_LSP_DAEMON_VERSION: "9.9.9",
    })
  })

  it("resolves the daemon from disk when the environment is empty", () => {
    // given
    const env = {}

    // when
    const config = createLspServerConfig(env, REPO_ROOT)

    // then
    expect(config.enabled).toBe(true)
    expect(config.command[0]).toBe(join(REPO_ROOT, "packages", "lsp-daemon", "dist", "cli.js"))
    expect(config.command[1]).toBe("mcp")
    expect(config.environment?.OMO_LSP_DAEMON_CLI).toBe(config.command[0])
    expect(config.environment?.OMO_LSP_DAEMON_VERSION).toBe("0.1.0")
  })

  it("stays disabled when neither the environment nor the disk provides a daemon", () => {
    // given
    const emptyDir = mkdtempSync(join(tmpdir(), "omo-lsp-no-repo-"))
    const env = {}

    try {
      // when
      const config = createLspServerConfig(env, emptyDir)

      // then
      expect(config.enabled).toBe(false)
      expect(config.command).toEqual(["node", "-e", "process.exit(1)"])
      expect(config.environment).toBeUndefined()
    } finally {
      rmSync(emptyDir, { recursive: true, force: true })
    }
  })
})
