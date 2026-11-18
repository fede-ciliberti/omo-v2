# src/features/tui-sidebar/ — TUI Sidebar Render Domain

**Generated:** 2026-11-18

## OVERVIEW

15 `.ts` files (9 impl + 6 co-located tests). This directory is the **render domain** of the
OpenCode TUI sidebar: state types, the snapshot schema, derivers, view selection, themed node
construction and the palette adapter. It performs no file I/O and owns no transport.

Both processes that consume it live elsewhere:

- server producer: `src/v2/tui-sidebar/{producer,loop-source,channel,definition}.ts`
- TUI slot: `src/v2/tui/sidebar.ts`, which claims `sidebar.content` with `append`

Gated on `tui.sidebar.enabled` (on unless explicitly `false`). The gate is read on the TUI side,
so a disabled sidebar simply never registers the slot.

## DATA FLOW

```
server:  sessions + background tasks + boulder/plan
           → buildSidebarSnapshot()  (v2/tui-sidebar/producer.ts)
           → channel: 2 s heartbeat + 250 ms debounce on session/execution events
wire:    rpc.omo-sidebar.sidebar-snapshot
TUI:     parseSnapshot → deriveAgents/deriveJobBoard/deriveLoop → computeView → viewKey diff
           → buildViewNodes → materializeNodes (JSX) → slot "sidebar.content"
```

## STRUCTURE

| File | Purpose |
|------|---------|
| `snapshot-schema.ts` | Zod `TuiRuntimeSnapshotSchema` (`SNAPSHOT_SCHEMA_VERSION = 2`) + `parseSnapshot` |
| `state-types.ts` | `kind`-tagged section unions, `SidebarView`, `assertNever` |
| `derivers.ts` | Snapshot → section states; jobs sorted by status priority (running first); caps `MAX_AGENTS`/`MAX_JOBS` = 12 |
| `compute-view.ts` | `computeView` picks active/broken/idle; `viewKey` gives a stable string for re-render diffing |
| `render-view.ts` | `buildViewNodes` (themed box/text tree) + `describeView` (plain lines); 24-char label truncation |
| `theme.ts` | `sidebarPalette`: adapts the V2 token TREE (`text.base`, `text.muted`, `text.feedback.*`, `border.base`) to the flat palette. Never returns `undefined`; unknown tokens degrade to fallbacks |
| `element-helpers.ts` | `ViewNode` type + `box`/`text` constructors (renderer-agnostic) |
| `project-dir.ts` | `canonicalProjectDir` (realpath) so two spellings of the project compare equal |
| `constants.ts` | Timing and size knobs: `STALE_MS` 6 s, `HEARTBEAT_MS` 2 s, `WRITE_DEBOUNCE_MS` 250 ms, `MAX_AGENTS`/`MAX_JOBS` 12, `LABEL_MAX` 24, `SNAPSHOT_SCHEMA_VERSION` 2 |

## KEY EXPORTS

- `computeView`, `viewKey`, `buildViewNodes`, `describeView`, the derivers, `sidebarPalette`:
  the render pipeline used by `src/v2/tui/sidebar.ts`.
- `TuiRuntimeSnapshot` + `parseSnapshot`: the cross-process payload contract. Bump
  `SNAPSHOT_SCHEMA_VERSION` on any shape change; a reader with a different version drops the
  payload and renders `idle`.
- `canonicalProjectDir`: used by both the channel (event filtering) and the slot (snapshot
  project matching).

## LIFECYCLE

There is no writer and no reader of files here. V1 polled a JSON mirror every second; that
mechanism was removed with the V1 line and its last remnants (`mirror-io.ts`, `mirror-path.ts`,
`qa/register-and-run.sh`) were deleted on 2026-11-18.

- Server: `createSidebarChannel(ctx)` rebuilds the snapshot on a 2 s heartbeat and on debounced
  session/execution events, then emits it.
- TUI: subscribes to the event, asks for the current snapshot on mount, keeps the derived view in
  `ctx.storage.memory` (reactive), and drops a snapshot older than `STALE_MS`.
- View selection: active if any of agents/jobs/loop is live; broken if config is invalid and
  nothing is active; idle otherwise.

## SOURCES OF TRUTH (V2)

The sidebar is runtime-only since 2026-11-17: it renders what the server reports, plus one line
when nothing is running. It does not list models.

| Section | Source | Process |
|---|---|---|
| **Agents** | the `running` map fed by `session.execution.*`, scoped to the project directory | server |
| **Jobs** | `listActiveBackgroundTasks()` from the orchestration registry | server |
| **ULW** | the boulder state (`readBoulderState`) plus the active plan's checkboxes (`getPlanChecklist`) | server |
| **Config banner** | `validatePluginConfig` messages (invalid config only) | TUI only |
| **idle** | fixed text: `no active sessions` | TUI only |

**ULW mapping.** `goalsDone`/`goalsTotal`/`pending` come from the plan checklist;
`blocked` is `total - completed - remaining` (the parser counts `[~]` rows in the total only);
`activeTask` is the first open top-level task label. A work counts as live when its status is
`active` or `paused` (the same rule the continuation engine uses) **and** the plan has at least
one checkbox. V1's `pass`/`fail` counters are gone: they came from `successCriteria` entries in
`goals.json`, an artifact the OpenCode host never writes, and the `ulw-execute` ledger records no
per-goal verdict. See `SNAPSHOT_SCHEMA_VERSION = 2`.

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

- The **Jobs** board is not the subagent board: the registry only holds `background_task`
  launches, while `subagent` children appear under **Agents** as executing sessions.
- `toolCalls`/`lastTool` are always `null` today (the V2 registry does not track them), so job rows
  render `0` and `none`.

## CONVENTIONS

- Every state is a `kind`-tagged union; exhaustive switches end in `assertNever`.
- Failure means degrade, never throw: bad JSON, missing files and stale data all collapse to
  `null` or `{ kind: "none" }`. Only non-Error throws are rethrown.
- Rendering carries no secrets: the snapshot has agent names, task descriptions (flattened and
  bounded to 60 chars) and plan task labels. It never carries prompts or message content.
- Plan task labels are shown as-is: they are repository content, not runtime goal objectives.

## ANTI-PATTERNS

- Don't share memory between the plugin and the TUI sides; the `omo-sidebar` RPC event is the only
  channel. `ctx.storage` is not shared across processes (measured).
- Don't change the snapshot shape without bumping `SNAPSHOT_SCHEMA_VERSION`.
- Don't read files from this directory: the loop/boulder read belongs to
  `src/v2/tui-sidebar/loop-source.ts`, which is server-side and read-only.
- Don't add new timing values inline; all knobs live in `constants.ts`.
- Don't render a counter the source cannot prove. A missing field is a gap to document, not a zero
  to print.
