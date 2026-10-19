import { normalizeSessionId } from "./shared"

export function normalizeState(state: Record<string, unknown>): void {
  normalizeSessionFields(state)

  const sessionIds = Array.isArray(state.session_ids) ? state.session_ids : []

  const sessionOrigins = state.session_origins && typeof state.session_origins === "object" && !Array.isArray(state.session_origins)
    ? (state.session_origins as Record<string, unknown>)
    : {}
  state.session_origins = sessionOrigins

  if (sessionIds.length === 1) {
    const soleSessionId = sessionIds[0]
    if (
      typeof soleSessionId === "string"
      && sessionOrigins[soleSessionId] !== "appended"
      && sessionOrigins[soleSessionId] !== "direct"
    ) {
      sessionOrigins[soleSessionId] = "direct"
    }
  }

  if (!state.task_sessions || typeof state.task_sessions !== "object" || Array.isArray(state.task_sessions)) {
    state.task_sessions = {}
  }

  normalizeWorkSessionFields(state.works)
}

function normalizeSessionFields(target: Record<string, unknown>): void {
  const sessionIds = Array.isArray(target.session_ids)
    ? target.session_ids.filter((sessionId): sessionId is string => typeof sessionId === "string").map((sessionId) => normalizeSessionId(sessionId))
    : []
  target.session_ids = sessionIds

  const sessionOrigins = target.session_origins && typeof target.session_origins === "object" && !Array.isArray(target.session_origins)
    ? normalizeSessionOrigins(target.session_origins as Record<string, unknown>)
    : {}
  target.session_origins = sessionOrigins
}

function normalizeSessionOrigins(sessionOrigins: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(sessionOrigins).map(([sessionId, origin]) => [normalizeSessionId(sessionId), origin]),
  )
}

function normalizeWorkSessionFields(works: unknown): void {
  if (!works || typeof works !== "object" || Array.isArray(works)) {
    return
  }

  for (const work of Object.values(works)) {
    if (work && typeof work === "object" && !Array.isArray(work)) {
      normalizeSessionFields(work as Record<string, unknown>)
    }
  }
}
