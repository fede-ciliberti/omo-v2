import { beforeEach, describe, expect, it } from "bun:test"

import { _resetThemeReportsForTesting, sidebarPalette } from "./theme"

type Rgba = { buffer: Record<number, number> }

function rgba(r: number, g: number, b: number, a = 255): Rgba {
  return { buffer: { 0: r, 1: g, 2: b, 3: a } }
}

function runtimeTheme() {
  return {
    text: {
      base: rgba(238, 238, 238),
      muted: rgba(128, 128, 128),
      faint: rgba(128, 128, 128),
      action: { primary: { selected: rgba(250, 178, 131) } },
      feedback: {
        error: { base: rgba(224, 108, 117), muted: rgba(224, 108, 117) },
        warning: { base: rgba(245, 167, 66), muted: rgba(245, 167, 66) },
        success: { base: rgba(127, 216, 143), muted: rgba(127, 216, 143) },
        info: { base: rgba(86, 182, 194), muted: rgba(86, 182, 194) },
      },
    },
    border: { base: rgba(72, 72, 72) },
  }
}

describe("tui sidebar theme adapter", () => {
  beforeEach(() => {
    _resetThemeReportsForTesting()
  })

  it("#given the real runtime token tree #when adapting #then every palette slot maps to its token", () => {
    // given
    const theme = runtimeTheme()

    // when
    const palette = sidebarPalette(theme)

    // then
    expect(palette.text).toEqual(rgba(238, 238, 238))
    expect(palette.textMuted).toEqual(rgba(128, 128, 128))
    expect(palette.error).toEqual(rgba(224, 108, 117))
    expect(palette.warning).toEqual(rgba(245, 167, 66))
    expect(palette.success).toEqual(rgba(127, 216, 143))
    expect(palette.info).toEqual(rgba(86, 182, 194))
    expect(palette.accent).toEqual(rgba(250, 178, 131))
    expect(palette.borderSubtle).toEqual(rgba(72, 72, 72))
  })

  it("#given an unknown theme #when adapting #then it degrades to readable fallbacks and never to undefined", () => {
    // given
    const theme = {}

    // when
    const palette = sidebarPalette(theme)

    // then
    for (const value of Object.values(palette)) {
      expect(value).toBeDefined()
      expect(typeof value).toBe("string")
    }
  })

  it("#given a token group where a color belongs #when adapting #then it rejects the group instead of passing it through", () => {
    // given the historical port bug: `theme.text` is a GROUP, not a color
    const theme = { text: { base: rgba(1, 2, 3), muted: rgba(4, 5, 6) }, border: { base: rgba(7, 8, 9) } }
    const broken = { ...theme, text: { base: theme.text } }

    // when
    const palette = sidebarPalette(broken)

    // then
    expect(palette.text).toBe("#eeeeee")
    expect(palette.textMuted).toBe("#808080")
    expect(palette.borderSubtle).toEqual(rgba(7, 8, 9))
  })

  it("#given a partial tree #when adapting #then present tokens win and missing ones fall back", () => {
    // given
    const theme = { text: { base: rgba(10, 20, 30) } }

    // when
    const palette = sidebarPalette(theme)

    // then
    expect(palette.text).toEqual(rgba(10, 20, 30))
    expect(palette.info).toBe("#56b6c2")
    expect(palette.borderSubtle).toBe("#484848")
  })

  it("#given string color tokens #when adapting #then they are accepted as-is", () => {
    const theme = { text: { base: "#abcdef", muted: "rgb(1,2,3)" } }

    // when
    const palette = sidebarPalette(theme)

    // then
    expect(palette.text).toBe("#abcdef")
    expect(palette.textMuted).toBe("rgb(1,2,3)")
  })
})
