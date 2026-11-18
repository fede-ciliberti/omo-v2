import { describe, expect, it } from "bun:test"

import { computeView } from "./compute-view"
import { buildViewNodes, describeView } from "./render-view"
import type { ComputeViewSections } from "./compute-view"
import type { SidebarView } from "./state-types"

const theme = {
  accent: "accent",
  borderSubtle: "border",
  error: "error",
  info: "info",
  success: "success",
  text: "text",
  textMuted: "muted",
  warning: "warning",
}

const activeSections: ComputeViewSections = {
  config: { kind: "invalid", messages: ["agents.sisyphus.model: expected string"] },
  agents: { kind: "list", agents: [{ name: "fixer", status: "busy" }] },
  jobs: { kind: "list", jobs: [{ title: "explore repo", status: "running", toolCalls: 3, lastTool: "grep" }] },
  loop: {
    kind: "live",
    goalsDone: 0,
    goalsTotal: 1,
    pending: 2,
    blocked: 1,
    activeTask: "g1",
  },
}

describe("tui sidebar renderView", () => {
  it("#given active view #when building nodes #then it renders ULW agents jobs and invalid banner in order", () => {
    // given
    const view = computeView(activeSections)

    // when
    const description = describeView(view)
    const nodes = buildViewNodes(view, theme)

    // then
    expect(description).toContain("config invalid")
    expect(description.indexOf("ULW")).toBeLessThan(description.indexOf("Agents"))
    expect(description.indexOf("Agents")).toBeLessThan(description.indexOf("Jobs"))
    expect(description).toContain("0/1")
    expect(description).toContain("pending 2 blocked 1")
    expect(description).toContain("active g1")
    expect(description).not.toContain("pass ")
    expect(description).not.toContain("fail ")
    expect(description).toContain("fixer")
    expect(description).toContain("explore repo")
    expect(nodes[0]?.kind).toBe("box")
  })

  it("#given a live loop with no open task #when describing #then it omits the active line", () => {
    // given
    const view = computeView({
      ...activeSections,
      loop: { ...activeSections.loop, activeTask: null },
    })

    // when
    const description = describeView(view)

    // then
    expect(description).toContain("ULW")
    expect(description).not.toContain("active ")
    expect(description).not.toContain("private")
  })

  it("#given broken view #when describing #then it includes config invalid and run doctor", () => {
    // given
    const view = computeView({
      config: { kind: "invalid", messages: ["agents.sisyphus.model: expected string"] },
          agents: { kind: "none" },
      jobs: { kind: "none" },
      loop: { kind: "none" },
    })

    // when
    const description = describeView(view)

    // then
    expect(view.kind).toBe("broken")
    expect(description).toContain("config invalid")
    expect(description).toContain("run doctor")
    expect(description).toContain("agents.sisyphus.model")
  })

  it("#given an idle view #when rendering #then it reports no active sessions and no model rows", () => {
    // given
    const view: SidebarView = { kind: "idle" }

    // when
    const description = describeView(view)
    const nodes = buildViewNodes(view, theme)

    // then
    expect(description).toBe("no active sessions")
    expect(description).not.toContain("Models")
    expect(nodes[0]?.kind).toBe("text")
  })
})
