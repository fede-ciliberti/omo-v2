/**
 * [OMC] v2 boulder-continuation module barrel.
 *
 * Barrel re-exports only; no logic lives here. The orchestrator owns this file
 * so parallel lanes never contend on it.
 */

export {
  applyBackoffExpiry,
  BACKOFF_FAILURE_THRESHOLD,
  BACKOFF_WINDOW_MS,
  createWorkCounterState,
  disarm,
  progressSignature,
  rearm,
  recordFailure,
  recordSteer,
  resetFailuresOnAdmission,
  resetOnProgress,
  shouldStopOnBackoff,
  shouldStopOnCap,
  STEER_CAP,
  type WorkCounterState,
} from "./signature"

export { findWorkForSessionId, isContinuableStatus, KNOWN_PREFIXES } from "./lookup"

export {
  armDebounce,
  cooldownActive,
  DEBOUNCE_CANCEL_EVENTS,
  DEBOUNCE_WINDOW_MAX_MS,
  DEBOUNCE_WINDOW_MIN_MS,
  debounceDueAt,
  debounceIsDue,
  isDebounceCancelledBy,
  matchesRearmPhrase,
  matchesStopPhrase,
  REARM_PHRASE_PATTERN,
  shouldStopOnNoProgress,
  STOP_PHRASE_PATTERN,
  type DebounceCancelEvent,
  type DebounceState,
} from "./guards"

export {
  NEXT_TASK_LABEL_NONE,
  renderDirective,
  type ContinuationDirectiveState,
} from "./directive"

export {
  CONTEXT_PRESSURE_MARKERS,
  EXTERNAL_BLOCKER_MARKER,
  hasAllowedExternalBlockerMarker,
  PRESSURE_SCAN_LIMIT,
  transcriptHasContextPressureMarker,
} from "./markers"

export {
  CONTINUATION_NOTICE,
  injectContinuation,
  type ContinuationSyntheticInput,
  type ContinuationSyntheticSession,
} from "./inject"

export {
  evaluateContinuation,
  type ContinuationBoulderPort,
  type ContinuationDeps,
  type ContinuationLogger,
  type ContinuationSessionPort,
} from "./gate"

export {
  GUARD_ORDER,
  SILENT_SKIP_REASONS,
  SKIP_LOG_PREFIX,
  skipLogLine,
  type ContinuationGuard,
  type ContinuationOutcome,
  type ContinuationSkipReason,
} from "./gate-order"

export {
  COUNTER_KEY_PREFIX,
  counterKey,
  createStorageCounterStore,
  parseCounterState,
  type ContinuationCounterStore,
  type ContinuationStorage,
} from "./gate-store"

export {
  evaluateGuards,
  lastAssistantText,
  latestUserMessageSince,
  type GuardEvaluation,
} from "./gate-guards"

export {
  createContinuationDeps,
  extractSessionIdFromEvent,
  startContinuationLoop,
  type ContinuationHostContext,
  type ContinuationHostEvent,
  type ContinuationLoopOptions,
  type ContinuationTimers,
} from "./loop"

export { createDebounceManager, defaultTimers, type DebounceManager } from "./loop-debounce"

export {
  isBoulderContinuationEnabled,
  registerBoulderContinuation,
  type LastDecision,
  type WorkStatus,
} from "./register"
