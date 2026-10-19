/**
 * [OMC] v2 boulder-continuation session lookup (task 5).
 *
 * Implements LOOKUP.md sections 2 and 3: a read-only, multi-prefix session
 * lookup that compares candidate id forms against stored `session_ids`
 * literally. It never calls `normalizeSessionId` and never rewrites persisted
 * ids, closing the drift where a bare query could not match a `codex:`/`senpi:`
 * work and an `opencode:` query could not match a bare work.
 */

import type { BoulderState, BoulderWorkState } from "@oh-my-opencode/boulder-state"
import { buildWorkFromMirror, getBoulderWorks } from "@oh-my-opencode/boulder-state"

// Equivalent to boulder-state storage/shared.ts:10 (closed set, never widened).
const SESSION_ID_PREFIX_PATTERN = /^(codex|opencode|senpi):/

export const KNOWN_PREFIXES = ["opencode", "codex", "senpi"] as const

interface Candidate {
  readonly form: string
  readonly rank: number
}

interface RankedMatch {
  readonly work: BoulderWorkState
  readonly rank: number
}

function stripKnownPrefix(sessionId: string): string {
  return sessionId.replace(SESSION_ID_PREFIX_PATTERN, "")
}

function dedupeByValueKeepingLowestRank(candidates: readonly Candidate[]): Candidate[] {
  const best = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const existing = best.get(candidate.form)
    if (!existing || candidate.rank < existing.rank) {
      best.set(candidate.form, candidate)
    }
  }
  return [...best.values()]
}

function buildCandidates(sessionId: string): Candidate[] {
  const bare = stripKnownPrefix(sessionId)
  return dedupeByValueKeepingLowestRank([
    { form: `opencode:${bare}`, rank: 0 },
    { form: bare, rank: 1 },
    { form: `codex:${bare}`, rank: 2 },
    { form: `senpi:${bare}`, rank: 3 },
  ])
}

function rankWork(work: BoulderWorkState, candidates: readonly Candidate[]): number | null {
  let best: number | null = null
  for (const { form, rank } of candidates) {
    if (work.session_ids.includes(form)) {
      best = best === null ? rank : Math.min(best, rank)
    }
  }
  return best
}

function updatedAtMs(work: BoulderWorkState): number {
  const parsed = Date.parse(work.updated_at ?? work.started_at)
  return Number.isNaN(parsed) ? 0 : parsed
}

function orderMatches(matches: readonly RankedMatch[]): RankedMatch[] {
  return [...matches].sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank
    }
    return updatedAtMs(right.work) - updatedAtMs(left.work)
  })
}

function logCollision(sessionId: string, workIds: readonly string[], chosenWorkId: string): void {
  console.warn(
    `[OMC] boulder-continuation: session lookup collision for ${sessionId}: ` +
      `matched work_ids=[${workIds.join(", ")}] chosen work_id=${chosenWorkId} ` +
      "(preference opencode: > bare > codex: > senpi:)",
  )
}

/**
 * The mirror fallback reuses `buildWorkFromMirror` from `@oh-my-opencode/boulder-state`
 * (exported since the atomic-write task) so the legacy single-work shape stays in one place.
 */
function findMirrorMatch(state: BoulderState, candidates: readonly Candidate[]): BoulderWorkState | null {
  const mirrorIds = Array.isArray(state.session_ids) ? state.session_ids : []
  for (const { form } of candidates) {
    if (mirrorIds.includes(form)) {
      return buildWorkFromMirror(state)
    }
  }
  return null
}

export function findWorkForSessionId(state: BoulderState, sessionId: string): BoulderWorkState | null {
  const candidates = buildCandidates(sessionId)

  const matches: RankedMatch[] = []
  for (const work of getBoulderWorks(state)) {
    const rank = rankWork(work, candidates)
    if (rank !== null) {
      matches.push({ work, rank })
    }
  }

  if (matches.length === 0) {
    return findMirrorMatch(state, candidates)
  }

  if (matches.length === 1) {
    return matches[0].work
  }

  const ordered = orderMatches(matches)
  const winner = ordered[0]
  logCollision(
    sessionId,
    ordered.map((match) => match.work.work_id),
    winner.work.work_id,
  )
  return winner.work
}

/**
 * LOOKUP.md section 3: `completed`/`abandoned` are known terminals, everything
 * else (including `undefined` and invented statuses such as `awaiting-user-ok`)
 * is not continuable. Callers own the section 5.3 warn.
 */
export function isContinuableStatus(status: unknown): boolean {
  return status === "active" || status === "paused"
}
