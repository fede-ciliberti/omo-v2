import { log } from "../../shared/logger"

/**
 * [OMC] V2 TUI sidebar palette.
 *
 * The V2 TUI host publishes `ctx.theme` as a token TREE (verified against
 * OpenCode 2.3.0): `text.base`, `text.muted`, `text.feedback.*.base`,
 * `border.base`, `hue.*`, `categorical.*`, ... The V1 render layer expected a
 * FLAT theme (`theme.text`, `theme.textMuted`, `theme.borderSubtle`), so the
 * ported sidebar handed openTUI token groups and `undefined` where a color was
 * required. That mismatch is what crashed the `sidebar.content` claim.
 *
 * This module is the single adapter between both shapes. It never returns
 * `undefined`: an unknown or malformed token degrades to a readable fallback,
 * so a host theme change can never take the sidebar down again.
 */

export type ColorLike =
  | string
  | {
      readonly buffer: { readonly [index: number]: number }
    }

export type SidebarPalette = {
  readonly text: ColorLike
  readonly textMuted: ColorLike
  readonly warning: ColorLike
  readonly error: ColorLike
  readonly success: ColorLike
  readonly info: ColorLike
  readonly accent: ColorLike
  readonly borderSubtle: ColorLike
}

type TokenPath = readonly string[]

const FALLBACK: SidebarPalette = {
  text: "#eeeeee",
  textMuted: "#808080",
  warning: "#f5a742",
  error: "#e06c75",
  success: "#7fd88f",
  info: "#56b6c2",
  accent: "#fab283",
  borderSubtle: "#484848",
}

const TOKEN_PATHS: Record<keyof SidebarPalette, TokenPath> = {
  text: ["text", "base"],
  textMuted: ["text", "muted"],
  warning: ["text", "feedback", "warning", "base"],
  error: ["text", "feedback", "error", "base"],
  success: ["text", "feedback", "success", "base"],
  info: ["text", "feedback", "info", "base"],
  accent: ["text", "action", "primary", "selected"],
  borderSubtle: ["border", "base"],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isColor(value: unknown): value is ColorLike {
  if (typeof value === "string") {
    return value.length > 0
  }
  return isRecord(value) && isRecord(value.buffer)
}

function readPath(theme: unknown, path: TokenPath): unknown {
  let current: unknown = theme
  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

const reported = new Set<string>()

function reportOnce(token: keyof SidebarPalette, path: TokenPath): void {
  if (reported.has(token)) {
    return
  }
  reported.add(token)
  log("[tui-sidebar] theme token missing; using fallback", { token, path: path.join(".") })
}

/**
 * Resets the warn-once memory. Test-only hook.
 */
export function _resetThemeReportsForTesting(): void {
  reported.clear()
}

export function sidebarPalette(theme: unknown): SidebarPalette {
  const palette: Record<keyof SidebarPalette, ColorLike> = { ...FALLBACK }

  for (const token of Object.keys(TOKEN_PATHS) as Array<keyof SidebarPalette>) {
    const path = TOKEN_PATHS[token]
    const value = readPath(theme, path)
    if (isColor(value)) {
      palette[token] = value
      continue
    }
    reportOnce(token, path)
  }

  return palette
}
