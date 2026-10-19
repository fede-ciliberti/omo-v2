import { closeSync, fsyncSync, openSync, renameSync, writeSync } from "node:fs"

/**
 * Writes `data` to a temp sibling, fsyncs it, then renames it over `filePath`.
 * The rename is atomic on POSIX, so a concurrent reader either sees the previous
 * full content or the new full content, never a partially written file.
 */
export function writeFileAtomicSync(filePath: string, data: string): void {
  const tempPath = `${filePath}.${process.pid}.tmp`
  const fileDescriptor = openSync(tempPath, "w")
  try {
    writeSync(fileDescriptor, data)
    fsyncSync(fileDescriptor)
  } finally {
    closeSync(fileDescriptor)
  }
  renameSync(tempPath, filePath)
}
