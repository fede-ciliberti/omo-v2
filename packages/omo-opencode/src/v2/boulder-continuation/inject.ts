/**
 * [OMC] v2 boulder-continuation synthetic injection (task 7).
 *
 * The ONLY injection route for a continuation steer is `session.synthetic` with
 * `delivery: "steer"` (DIRECTIVE.md section 5). This module never calls the raw
 * prompt APIs; the T7 static gate greps for the forbidden raw-prompt call
 * strings over the module's TypeScript sources.
 *
 * `session` carries the turn's bare `sessionID` alongside the host `synthetic`
 * method, so the 4-argument call `injectContinuation(session, text, description,
 * metadata)` can address the session without a 5th argument.
 */

import type { JsonValue, SessionInboxSynthetic } from "@opencode/client"

/** Metadata notice stamped on every continuation synthetic. */
export const CONTINUATION_NOTICE = "omo-boulder-continuation"

/** The `session.synthetic` request shape used for a steer. */
export interface ContinuationSyntheticInput {
  readonly sessionID: string
  readonly text: string
  readonly description: string
  readonly metadata: Record<string, JsonValue>
  readonly delivery: "steer"
}

/**
 * Minimal session surface the injector needs: the turn's bare id plus the host
 * `synthetic` method. The real OpenCode `SessionDomain` satisfies the method;
 * the gate binds it with the turn's `sessionID`.
 */
export interface ContinuationSyntheticSession {
  readonly sessionID: string
  synthetic(input: ContinuationSyntheticInput): Promise<SessionInboxSynthetic>
}

/**
 * Inject one continuation directive via `session.synthetic` with
 * `delivery: "steer"` (default `resume`), stamping the
 * `notice: "omo-boulder-continuation"` metadata. Returns the admitted
 * `SessionInboxSynthetic.id` for auto-attribution.
 */
export async function injectContinuation(
  session: ContinuationSyntheticSession,
  text: string,
  description: string,
  metadata: Record<string, JsonValue> = {},
): Promise<string> {
  const admitted = await session.synthetic({
    sessionID: session.sessionID,
    text,
    description,
    metadata: { ...metadata, notice: CONTINUATION_NOTICE },
    delivery: "steer",
  })
  return admitted.id
}
