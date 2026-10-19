# boulder-continuation - work-plan auto-continuation (V2)

## OVERVIEW

Resumes a Prometheus work plan automatically when an agent ends a turn with top-level
checkboxes still open, instead of waiting for a manual nudge. Adapted from the Codex Light
edition component (`packages/omo-codex/plugin/components/ulw-execute-continuation/`), not
from the V1 atlas hook. Triggers on the durable `session.execution.succeeded` edge
(`session.idle` is deprecated) and injects through `session.synthetic` only.

Ships **disabled** (`boulder_continuation.enabled` defaults to `false`). When disabled it
registers no event subscription and changes nothing; the RPC status still reports
`enabled:false`.

## LAYOUT

| File | Role |
|------|------|
| `SPEC.md`, `LOOKUP.md`, `DIRECTIVE.md` | Design docs (state model + guards, multi-prefix lookup + status mapping, directive + marker + context valve). No code. |
| `signature.ts` | `progressSignature(work_id, checklist)` = `"<work_id>:<completed>/<total>"` (never `updated_at`) + per-work counters + pure transitions + cap/backoff predicates. |
| `lookup.ts` | `findWorkForSessionId(state, sessionId)`: closed prefix set {bare, `opencode:`, `codex:`, `senpi:`} + bare-suffix compare, collision preference, read-only. `isContinuableStatus` (true only for `active`/`paused`). |
| `guards.ts` | Pure guards: no-progress (`>= 2`), cooldown (5 s), debounce window + cancel-event set, stop/re-arm phrase regexes. |
| `directive-template.ts` / `directive.ts` | The injected directive text (own `.ts` module so it survives bundling) and `renderDirective(state)` placeholder substitution. |
| `markers.ts` | `hasAllowedExternalBlockerMarker` (marker on the first line **and** non-empty blocker text; no ultrawork-opener variant) and `transcriptHasContextPressureMarker` (adapted valve + V2 compaction signal). |
| `inject.ts` | `injectContinuation(session, text, description, metadata)` - the only injection route (`session.synthetic`, `delivery: "steer"`, `notice: "omo-boulder-continuation"`). |
| `gate.ts` / `gate-order.ts` / `gate-guards.ts` / `gate-deps.ts` / `gate-store.ts` | The ordered decision, its reason vocabulary, the guard evaluation, the injectable dependency ports, and the counter store (`ctx.storage`, key `boulder-continuation/<work_id>`). |
| `loop.ts` / `loop-debounce.ts` | Subscription lifecycle (`ctx.event.subscribe`, AbortController) and per-session debounce with cancellable timers. |
| `register.ts` | `registerBoulderContinuation(ctx)`: reads the flag, starts the loop when enabled, registers the `omo.continuation` RPC. Wired from `src/v2/index.ts`. |
| `index.ts` | Barrel re-exports only. Orchestrator-owned. |

## GATE ORDER (TOTAL ORDER, every skip logs its reason)

`session.execution.succeeded` →
1. debounce wait (default 3 s, band 3-5 s; cancelled by `session.inbox.delivered`, `session.inbox.enqueued`, `session.execution.started`, `tui.prompt.append`);
2. re-read user messages since the last steer → stop/re-arm phrase detector (disarm consumes nothing);
3. re-read boulder state (`readBoulderStateDetailed`: absent = silent, corrupt = warn);
4. `reconcileStaleWorks` (repair side-effect, no sessions directory);
5. multi-prefix lookup (miss = **silent** skip);
6. status gate (`active`/`paused` continue; known terminals silent; unknown status warns);
7. checklist; `remaining === 0` → idempotent `completeBoulder`, zero synthetic;
8. guards in order: blocked-marker → context-pressure → no-progress → cooldown → cap (30) → backoff (10 failures / 5 min) → disarmed → inject.

On admission: `recordSteer` + `resetFailuresOnAdmission`. On injection failure: `recordFailure`.

## SAFETY PARAMETERS

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| progress signature | `(work_id, completed, total)` | `updated_at` measures activity, not progress; including it would defeat the no-progress stop. |
| no-progress stop | 2 steers with the same signature | each steer is a full model turn; converges to 2. |
| hard cap | 30 / work (durable, never reset) | ~4x the worst observed manual need (7 nudges); bounds cost at 30 model turns. |
| cooldown | 5 s | anti-burst incl. reconnect replays. |
| failure backoff | 10 failures → 5 min → reset | distinguishes a dead endpoint from a transient failure. |
| debounce | 3 s (band 3-5 s) | user-supremacy window; cancellation matters more than the delay. |
| counters | `ctx.storage` key `boulder-continuation/<work_id>` | runtime-proven durable across host restart (SQLite `kv`). |

## CONFIG + RPC

- **Config:** plugin options → `ctx.options.boulder_continuation.enabled` (boolean, default `false`).
  In `opencode.json`, use the encoded form:
  `"plugins": [{ "package": "<repo>", "options": { "boulder_continuation": { "enabled": true } } }]`.
- **RPC:** `omo.continuation` / `status`. Over HTTP: `POST /api/rpc/omo.continuation/status`
  with body `{"input":{}}`. Returns `{ enabled, works: [...counters], lastDecision }`.

## TESTING

`bun test packages/omo-opencode/src/v2/boulder-continuation/` - unit (TDD) + integration
suite driven by in-module host fakes. Strict gate:
`tsgo --noEmit -p packages/omo-opencode/tsconfig.json`.

Live QA evidence (isolated XDG sandbox, real host): `.omo/evidence/ulw-execute-v2-continuation/`
(gitignored).

## KNOWN GAPS

- **Subagent-crash resume** stays host-owned; `session.execution.interrupted` is not subscribed.
- **Pending-revert stall**: a steer injected while an approval is pending burns cap and can trip
  the 2-steer stop. No clean pre-inject permission signal exists in the plugin surface.
- **Question-asked detector**: a plain-text agent question without the blocker marker or `[~]`
  is not detected; the directive instructs `[~]` for external blocks.
- **Agent full-file rewrite**: two writers on `.omo/boulder.json`; atomic tmp+rename prevents
  torn writes, not read-modify-write races from a stale agent context copy.
- **Stop-phrase regex carries the `m` flag** (per contract), so a multi-line message matches
  per line rather than whole-message. Conservative direction (over-disarm).
- **`OPENCODE_DB=":memory:"`** is an explicit in-memory opt-out the durability verdict does not cover.
