# src/features/tui-sidebar/ — TUI Sidebar Snapshot + Mirror

**Generated:** 2026-08-17

## OVERVIEW

22 .ts files (11 impl + 11 co-located tests). Two halves connected only by a JSON mirror file on disk: the plugin process writes runtime snapshots (`TuiStateMirror`), the TUI process polls the mirror, derives section states, and renders sidebar nodes. Gated on `tui.sidebar.enabled` (on unless explicitly `false`).

## DATA FLOW

```
plugin side:  events/heartbeat → TuiStateMirror.flush() → buildTuiRuntimeSnapshot() → writeMirror() (atomic JSON)
TUI side:     1s poll → readMirror() → derivers → computeView() → viewKey diff → buildViewNodes() → sidebar_content
```

## STRUCTURE

| File | Purpose |
|------|---------|
| `snapshot-schema.ts` | Zod schema `TuiRuntimeSnapshotSchema` (version literal 1) + `parseSnapshot` |
| `mirror-io.ts` | `writeMirror` (atomic, mode 0600) / `readMirror` — rejects unparseable, wrong-project, or stale (>6s) snapshots |
| `mirror-path.ts` | XDG data dir + sha1(projectDir) prefix filename; `canonicalProjectDir` via realpath |
| `derivers.ts` | Snapshot → section states; jobs sorted by status priority (running first), caps MAX_AGENTS/MAX_JOBS = 12 |
| `compute-view.ts` | `computeView` picks active/broken/idle; `viewKey` gives stable string for re-render diffing |
| `render-view.ts` | `buildViewNodes` (themed box/text tree) + `describeView` (plain lines); 24-char label truncation |
| `state-types.ts` | Discriminated-union section states (`kind` tags) + `assertNever` |
| `element-helpers.ts` | `ViewNode` type + `box`/`text` constructors (renderer-agnostic) |
| `theme.ts` | `sidebarPalette` — adapts the V2 token TREE (`text.base`, `text.muted`, `text.feedback.*`, `border.base`) to the flat palette the render layer reads. Never returns `undefined`: unknown tokens degrade to fallbacks, so a host theme change cannot crash the slot |
| `constants.ts` | All timing/size knobs: STALE_MS 6s, HEARTBEAT_MS 2s, POLL_INTERVAL_MS 1s, WRITE_DEBOUNCE_MS 250ms, LOOP_FRESH_MS 120s |

## KEY EXPORTS

- `TuiStateMirror` — constructed in `src/create-managers.ts` when sidebar enabled; deps injected (`client`, `backgroundManager`, optional `getStatuses`/`sessionAgentResolver`).
- `readMirror`, `computeView`, `viewKey`, `buildViewNodes`, derivers, `POLL_INTERVAL_MS` — consumed by `src/tui.ts` on the render side.
- `TuiRuntimeSnapshot` — the cross-process contract; bump `MIRROR_SCHEMA_VERSION` on shape changes (readers drop non-matching versions).

## LIFECYCLE / WIRING

- Writer: `create-managers.ts` instantiates the mirror; `onEvent()` triggers debounced flush, `start()` adds heartbeat, `stop()` clears timers and resolves pending flushes.
- Reader: `tui.ts` polls every 1s, re-renders only when `viewKey` changes, falls back to the idle view when the mirror is missing or stale.
- View selection: active if any of agents/jobs/loop is live; broken if config invalid and nothing active; idle otherwise.

## V2 WIRING — the producer lives under `src/v2/tui-sidebar/`

The V1 writer half (`TuiStateMirror`, `snapshot-builder`, `loop-reader`, `config-validator`)
was removed with the V1 line (task 18), so `writeMirror` still has no caller and the file
mirror path is dead in V2. The replacement keeps the same snapshot shape but pushes it over
an RPC event instead of a file:

| Module | Role |
| --- | --- |
| `src/v2/tui-sidebar/producer.ts` | Pure derivation: registry tasks + executing sessions -> `TuiRuntimeSnapshot` (same v1 shape). Redacts and bounds task titles; `toolCalls`/`lastTool` are `null` because the V2 registry does not track them |
| `src/v2/tui-sidebar/definition.ts` | The `omo-sidebar` RPC contract shared by both processes |
| `src/v2/tui-sidebar/channel.ts` | Server side: rebuilds on a 2 s heartbeat and on debounced session/execution events, then emits `rpc.omo-sidebar.sidebar-snapshot` |
| `src/v2/tui/sidebar.ts` | TUI side: subscribes to that event, asks for the current snapshot on mount, keeps it in `ctx.storage.memory` (reactive) and drops it after `STALE_MS` without a push |

`ctx.storage` is NOT shared between the server and TUI processes (measured), so it must never
be used as the cross-process channel. RPC events measured 11-12 ms cross-process.

The ULW/loop section still has no V2 source: the snapshot carries `loop: null` until Fase 3.

## SOURCES OF TRUTH (V2): which file decides what

The sidebar is runtime-only since 2026-11-17: it renders what the server reports, plus one line
when nothing is running. It does not list models.

| Section | Source | Process |
|---|---|---|
| **Agents** | the server snapshot: the `running` map fed by `session.execution.*` events, scoped to the plugin's project directory | server |
| **Jobs** | the server snapshot: `listActiveBackgroundTasks()` | server |
| **Config banner** | `validatePluginConfig` messages (invalid config only) | TUI only |
| **idle** | fixed text: `no active sessions` | TUI only |

**Models are not part of the sidebar.** The V2 server plugin never reads the omo config chain
(`loadOmoOpenCodeConfigChain`: 0 in `dist/index.js`, 2 in `dist/tui-entry.js`; the TUI half uses it
only for the mount gate and the config banner). Per-agent models come from
`~/.config/opencode/opencode.json`: `agents.<id>.model`, with the top-level `model` /
`small_model` as defaults. The host resolves them per request.

History, and why the panel is gone: until 2026-11-17 the idle view listed a roster built from
`~/.omo/omo.jsonc` (`resolveRoster`). Measured on the machine that removed it: 20 rows, of which
6 of 11 agents named a different model than `opencode.json` and 9 were V1 categories with no V2
counterpart. The removed config is archived verbatim in
[`docs/reference/omo-config-archive.md`](../../../../../docs/reference/omo-config-archive.md).

- the **Jobs** board is not the subagent board: the registry only holds `background_task`
  launches, while `subagent` children appear under **Agents** as executing sessions.

## CONVENTIONS

- Every state is a `kind`-tagged union; exhaustive switches end in `assertNever`.
- Failure means degrade, never throw: bad JSON, missing files, stale data all collapse to `null` / `{ kind: "none" }`. Only non-Error throws are rethrown.
- All writes go through `writeFileAtomically`; readers validate version, project dir, and freshness before trusting the file. **V1 mirror path only**: V2 writes no mirror, see SOURCES OF TRUTH below.
- Privacy: goal titles are redacted to `null` before writing; render side shows "private".

## ANTI-PATTERNS

- Don't share memory between plugin and TUI sides; the `omo-sidebar` RPC event is the only channel. The V1 mirror file is dead in V2.
- Don't change snapshot shape without bumping `MIRROR_SCHEMA_VERSION`; old readers silently drop the file otherwise.
- Don't write the mirror directly (V1 legacy); go through `TuiStateMirror.flush()` so debounce and in-flight dedup hold.
- Don't add new timing values inline; all knobs live in `constants.ts`.
