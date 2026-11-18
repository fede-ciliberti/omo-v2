import { realpathSync } from "node:fs"
import { resolve } from "node:path"

/**
 * Canonical form of a project directory, so two spellings of the same path
 * (symlink, relative, trailing slash) compare equal.
 */
export function canonicalProjectDir(projectDir: string): string {
  try {
    return realpathSync.native(projectDir)
  } catch (error) {
    if (error instanceof Error) {
      return resolve(projectDir)
    }
    throw error
  }
}
