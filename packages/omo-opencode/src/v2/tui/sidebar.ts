import type { Plugin } from "@opencode/plugin/tui"

import { validatePluginConfig } from "../../config/validate"
import { computeView, viewKey } from "../../features/tui-sidebar/compute-view"
import { STALE_MS } from "../../features/tui-sidebar/constants"
import {
  deriveAgents,
  deriveConfig,
  deriveJobBoard,
  deriveLoop,
} from "../../features/tui-sidebar/derivers"
import { canonicalProjectDir } from "../../features/tui-sidebar/project-dir"
import { buildViewNodes } from "../../features/tui-sidebar/render-view"
import { parseSnapshot, type TuiRuntimeSnapshot } from "../../features/tui-sidebar/snapshot-schema"
import type { SidebarView } from "../../features/tui-sidebar/state-types"
import { sidebarPalette } from "../../features/tui-sidebar/theme"
import { log } from "../../shared/logger"
import { SIDEBAR_EVENT, SIDEBAR_METHOD, sidebarRpcDefinition } from "../tui-sidebar/definition"
import { materializeNodes } from "./render"

/**
 * [OMC] v2 TUI sidebar slot.
 *
 * Ports the V1 sidebar to the V2 slot model. The domain pipeline
 * (validate config -> `computeView` -> `buildViewNodes`) is unchanged;
 * what changed is where the live state comes from:
 *
 *   V1: poll a JSON mirror every 1 s (closure + `requestRender()`).
 *   V2: the server plugin pushes a snapshot over the `omo-sidebar` RPC event;
 *       this side keeps it in a Solid signal, so the mounted claim re-renders
 *       on arrival. On mount it also asks for the current snapshot, so a window
 *       that opens between heartbeats is never blank.
 *
 * A local freshness timer drops a snapshot older than {@link STALE_MS}, which
 * preserves the V1 semantics when the server stops pushing.
 */

type SidebarState = {
  key: string
  view: SidebarView
}

function viewFrom(directory: string, snapshot: TuiRuntimeSnapshot | null): SidebarView {
  const validation = validatePluginConfig(directory)
  return computeView({
    config: deriveConfig({ valid: validation.valid, messages: validation.messages }),
    agents: deriveAgents(snapshot),
    jobs: deriveJobBoard(snapshot),
    loop: deriveLoop(snapshot),
  })
}

function incoming(payload: unknown, directory: string): TuiRuntimeSnapshot | null {
  const snapshot = parseSnapshot(payload)
  if (snapshot === null) {
    return null
  }
  if (canonicalProjectDir(snapshot.projectDir) !== canonicalProjectDir(directory)) {
    return null
  }
  return snapshot
}

/**
 * Registers the `sidebar.content` slot. Returns a cleanup function.
 */
export async function registerSidebarSlot(ctx: Plugin.Context): Promise<() => void> {
  const directory = ctx.location?.directory
  if (directory === undefined) {
    log("[tui-sidebar] no project directory; sidebar slot not registered")
    return () => undefined
  }

  if (validatePluginConfig(directory).config.tui?.sidebar?.enabled === false) {
    log("[tui-sidebar] sidebar disabled by config")
    return () => undefined
  }

  const initialView = viewFrom(directory, null)
  // The host's store IS the reactive core of the claim: reading `state.view`
  // inside the render tracks, and a mutation re-renders the mounted slot.
  const [state, mutate] = ctx.storage.memory<SidebarState>("omo-sidebar-view", {
    initial: { key: viewKey(initialView), view: initialView },
  })

  let lastSnapshotAt = 0

  const apply = (snapshot: TuiRuntimeSnapshot | null): void => {
    const next = viewFrom(directory, snapshot)
    const nextKey = viewKey(next)
    if (nextKey === state.key) {
      return
    }
    mutate((draft) => {
      draft.key = nextKey
      draft.view = next
    })
  }

  const receive = (snapshot: TuiRuntimeSnapshot | null): void => {
    if (snapshot === null) {
      return
    }
    lastSnapshotAt = Date.now()
    apply(snapshot)
  }

  const unregisterSlot = ctx.ui.slot({
    append: "sidebar.content",
    render: () => materializeNodes(buildViewNodes(state.view, sidebarPalette(ctx.theme))),
  })

  const rpc = ctx.client.rpc(sidebarRpcDefinition)

  const unsubscribe = rpc.events.on(SIDEBAR_EVENT, (payload) => {
    receive(incoming(payload?.data, directory))
  })

  // Snapshot on attach: a window opened between heartbeats starts populated.
  void rpc[SIDEBAR_METHOD]({})
    .then((payload) => {
      receive(incoming(payload, directory))
    })
    .catch(() => undefined)

  // Freshness guard: no push for a while means the state is no longer live.
  const staleTimer = setInterval(() => {
    if (lastSnapshotAt === 0 || Date.now() - lastSnapshotAt <= STALE_MS) {
      return
    }
    lastSnapshotAt = 0
    apply(null)
  }, STALE_MS)

  return () => {
    clearInterval(staleTimer)
    unsubscribe()
    unregisterSlot()
  }
}
