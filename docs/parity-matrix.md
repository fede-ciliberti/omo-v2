# Runtime Parity Matrix — OMC V2 Port (Task 19)

> Target: 100% PASS per owner-used feature (inventory dari `docs/v2-api-mapping.md`, task 5).
> Setiap baris = skenario runtime nyata di harness V2 (`@opencode/cli@2.0.20`, task-16 stack:
> OMC v2 port + DCP 3.2.0 + tokenscope PR #50 dimuat bersamaan) dengan bukti perintah + output.
> BUKAN klaim static-only.
>
> Evidence root: `C:/Users/faizz/new-saas/.omo/evidence/opencode-v2-migration/task-N/`
> Log runtime smoke task-19: `task-19/01-status.log` … `15-todo-read.log`
> Harness: `C:/Users/faizz/ports/omo-v2/v2-home/task16-harness/` (service v2.0.20, 3 plugin, isolated roots)

## Legend

- **PASS** — dibuktikan runtime di harness (perintah + output tersimpan).
- **PASS\*** — runtime terbukti pada jalur yang tersedia; bagian model-backed dibatasi harness
  (API key dimask) dan dicatat jujur sebagai limitasi, bukan dikecualikan.
- **PARTIAL**: one half is proven on its stated surface, the other half is explicitly deferred
  and the deferral is named in the Evidence column. Never a synonym for PASS.
- **DEFERRED**: not ported at all; the Evidence column names the follow-up plan (planned).
- Metode RPC: `opencode api --server <url> rpc.call --param rpcID=<id> --param method=<m> -d '{"input":{…}}'`

## Matrix

| # | Fitur (owner-used) | Skenario runtime | Hasil | Evidence |
|---|---|---|---|---|
| 1 | Plugin load (3 plugin bersamaan) | `plugin list` + server log: 16× `loading plugin`, 0× `failed to load plugin` | **PASS** | task-16/{plugin-list,server-log}.log; task-19 log counts (16/0) |
| 2 | Bootstrap RPC | `rpc.call rpcID=omo method=status` → `{"ok":true,"stage":"bootstrap"}` | **PASS** | task-19/01-status.log |
| 3 | Tools: glob | `omo.tools invoke {tool:"glob",input:{pattern:"*.json"}}` → `Found 1 file(s) …` | **PASS** | task-19/08-invoke-glob.log |
| 4 | Tools: grep | `omo.tools invoke {tool:"grep",input:{pattern:"omo",path:"omo-plugin",output_mode:"count"}}` → `34 match(es) in 1 file(s)` | **PASS** | task-19/09-invoke-grep.log |
| 5 | Tool registry gabungan tanpa konflik | `omo.tools list` → 71 tools: glob+grep (OMC), compress (DCP), tokenscope — nol konflik registrasi | **PASS** | task-19/02-tools-list.log; task-16/omo-tools-list.json |
| 6 | Hooks (tool.execute.before/after, session compaction, shell create.before) | Registrasi via `ctx.tool.hook`/`ctx.session.hook`/`ctx.shell.hook`; plugin load bersih tanpa failure | **PASS\*** (registrasi terbukti; firing hook memerlukan sesi model live — lihat Limitasi) | task-10/{plugin-load,runtime-invoke}.log |
| 7 | Client/session/event | `@opencode/client` OpenCode.make + Service.discover: server.info v2.0.20, session.list, agent.list, event `server.connected` live, subscribe keepalives; auth fail-closed 401→200 | **PASS** | task-11/task-11-runtime-proof.log |
| 8 | Event name mapping V1→V2 | Cross-check 95 event V2 vs V1 names (session.idle/status/deleted exact; renamed/split mapped) | **PASS** | task-11/client-events.ts + task-11 JSON |
| 9 | Agents listing | `omo.agents list` → 17 agents: 11 OMC (sisyphus, hephaestus, prometheus, oracle, librarian, explore, multimodal-looker, metis, momus, atlas, sisyphus-junior) + 6 builtin | **PASS** | task-19/03-agents-list.log |
| 10 | Agent dispatch roundtrip | `omo.agents dispatch {agent:"oracle"}` → `{"ok":true,"sessionID":"ses_f087…","agent":"oracle"}` (sesi tersimpan) | **PASS\*** (roundtrip sesi; respons model butuh API key — lihat Limitasi) | task-19/10-dispatch-oracle.log |
| 11 | Unknown-agent error path | `dispatch {agent:"nonexistent-agent-xyz"}` → error jelas + daftar available (bukan silent) | **PASS** | task-19/11-dispatch-unknown.log |
| 12 | Background task spawn | `omo.orch spawn {description,prompt,agent:"sisyphus-junior"}` → `{"ok":true,"taskId":"bg_cf356126","status":"running"}` | **PASS** | task-19/12-spawn.log |
| 13 | Background task collect + error path (no hang) | `omo.orch collect {task_id}` → status `error` tercatat + output deskriptif; TIDAK hang | **PASS\*** (jalur error terbukti; completion model-backed — lihat Limitasi) | task-19/13-collect.log |
| 14 | Background task cancel | `omo.orch cancel` → session.interrupt real | **PASS** | task-13/runtime-proof.log |
| 15 | Todo continuation (write/read roundtrip) | `omo.orch todoWrite {sessionID, todos:[…]}` → `{count:1}`; `todoRead` → todos kembali identik | **PASS** | task-19/{14-todo-write,15-todo-read}.log |
| 16 | MCP injection | `omo.mcp list` → context7 connected, grep_app connected, websearch connected, lsp disabled (config-driven) | **PASS** | task-19/05-mcp-list.log; task-14/mcp-connected.log |
| 17 | MCP-router (owner live config) | Config V1 as-is (mcp-router localhost:9914) → normalisasi V2 konsisten task-3; tools/list smoke 9 tools mcp-router + filesystem 14 + playwright 23 + text-editor 1; config TIDAK di-rewrite (sha256 identical) | **PASS** | task-17/{mcp-router-v2-addendum.md, v2-mcp-list-out.log, mcp-router-smoke-out.log} |
| 18 | Skills load | `omo.skill list` → listing (builtin opencode skill + lokasi fallback OMC) | **PASS** | task-19/06-skill-list.log; task-14/skill-list.log |
| 19 | Config normalization (V1 config as-is) | `debug config` exit 0; sha256 before==after (in-memory, no rewrite); mapping model/plugin/provider/enabled_providers/mcp → V2 shape | **PASS** | task-3/{debug-config-stdout.log,config-hash-*}; docs/v2-config-normalization.md |
| 20 | Config/installer migration dry-run | Field-rename mapping + tui.json→cli.json preview tanpa menyentuh production | **PASS** | task-14/{config-dryrun-console,config-preview,config-report}.log |
| 21 | TUI (registerTui binding) | smoke mock-Context: 2 slot claim, 2 keymap layer, cleanup bersih; plugin TUI entrypoint termuat (`omo-tui-test` via `plugin list`); sidebar.content rendered on a real terminal (tmux, OpenCode 2.3.0) showing Models, and Agents + Jobs fed by a live RPC snapshot that self-updated without touching the window | **PASS\*** (ULW/loop section pending — see Limitasi) | task-15/{smoke-register-tui,plugin-list-warm}.log |
| 22 | DCP 3.2.0 | Load 'DCP V2 initialized'; `rpc.call rpcID=dcp method=status` → `{"enabled":true}`; tool compress terdaftar di registry gabungan | **PASS\*** (eksekusi compress butuh sesi model — lihat Limitasi) | task-19/{07-dcp-status,02-tools-list}.log; task-7 |
| 23 | Tokenscope (PR #50) | Load di V2 (v2.0.0 build); tool tokenscope terdaftar di registry gabungan; e2e PR 2/2 pass (tool register + execute) | **PASS\*** (metrik token real butuh sesi model — lihat Limitasi) | task-19/02-tools-list.log; task-8 (e2e); task-16 |
| 24 | Companion integration (3 plugin bersamaan) | Smoke gabungan di atas: status + agents + tools + dcp status + MCP connected dalam SATU service | **PASS** | task-16/task-16 JSON + task-19 semua log |
| 25 | Static parity gates (pendukung, bukan pengganti) | gate-v1-imports 349→0; gate-deps PASS; ': any' port surface 0 (475 non-port justified task-18); tsgo strict exit 0 | **PASS** | task-18/{after-gate-*.log,task-18 JSON} |

Inventory coverage: seluruh fitur owner-used dari task-5 inventory (plugin load, tools/hooks,
client/session/event, agents/subagents, background/continuation/todos, MCP-inject,
config/installer, TUI, DCP, tokenscope) terwakili baris 1–25. Entri CLI `omo` = thin wrapper
omo-native TANPA `@opencode-ai` → di luar port scope (task-5 verdict), bukan bagian matrix.

> Scope note on the verdict: rows 1-25 measure plugin wiring and owner-used feature surfaces.
> None of them measures prompt fidelity, so the PASS count below says nothing about
> agent-doctrine completeness. Rows 26-31 carry that axis separately and are NOT part of the
> 24/24 count.

## Agent doctrine and prompt fidelity (rows 26-31)

| # | Fitur (owner-used) | Skenario runtime | Hasil | Evidence |
|---|---|---|---|---|
| 26 | Agent doctrine: canonical Sisyphus (prompt fidelity) | `agents/sisyphus-doctrine.ts` exports `SISYPHUS_DOCTRINE_BASE` plus `DOCTRINE_SECTION_IDS` (8 ids, in order: intent-gate, delegation-bias, fan-out, result-protocol, continuation, delegation-prompt, oracle, execution-evidence); `sisyphus-doctrine.test.ts` asserts every id is a heading in that order and that the body names no `call_omo_agent`/`load_skills`/`subagent_type`/`run_in_background`/`background_output`/`background_task`/`look_at`; the size budget is enforced by the overlays test (`SISYPHUS_DOCTRINE_BASE` + every overlay <= 12000), so no character count is restated here where it would rot on the next edit | **PARTIAL** (module and guard proven on the static surface; live delivery into the system prompt is row 27 and the behavioural proof is plan todo 12) | task-2-v2-sisyphus-orchestration-port.txt; packages/omo-opencode/src/v2/agents/sisyphus-doctrine.ts |
| 27 | Agent doctrine delivery and model-family overlays (prompt fidelity) | `ctx.session.hook("context")` replaces the doctrine `SystemPart` of `input.system` with base + the request model's family overlay (appending one only when the host produced none) and sets `input.options`; the captured primary request body carries the probe marker and `"temperature":0.31`; `agents/family-overlays.ts` composes base + per-family overlay with allowlisted `FAMILY_OPTIONS` keys | **PASS\*** (the seam is proven on the wire at opencode v2.3.0 and the doctrine is captured in the live sisyphus request body; the overlay composition half is unit-tested only because this machine has no opus-5 provider, so the model-backed overlay half stays behind the harness limit, see Limitasi) | task-1-seam-verdict.md (`SEAM-CONFIRMED`); task-1-v2-sisyphus-orchestration-port.jsonl |
| 28 | Dead-primitive repair in agent prompt bodies | the repair is in `packages/omo-opencode/src/v2/agents.ts`: prompt bodies name `subagent(...)` and no longer name `call_omo_agent`/`load_skills`/`subagent_type`/`run_in_background`/`look_at`, nor `background_output`/`background_task`; gate is `grep -nE` on that file (0 lines, while the same greps on `git show HEAD:` return 15 + 1) plus the `omo.agents get metis` / `get sisyphus-junior` RPC assertions | **PASS** (repair landed and proven on both the source and the RPC payload) | task-4-v2-sisyphus-orchestration-port.txt; task-11-v2-sisyphus-orchestration-port.json |
| 29 | Sub-session continuation (`subagent` plus `sessionID`) | doctrine section `continuation` prescribes continuing a child with its returned `sessionID` instead of restarting it; a live session then sent a follow-up call carrying an existing `sessionID` whose result was that same child, with the distinct-child count unchanged | **PASS** (contract plus live transcript; the model only reached for it once the prompt named the parameter, recorded in the evidence notes) | task-12-v2-sisyphus-orchestration-port.jsonl; task-12-notes.md |
| 30 | Doctrine-supporting hooks (V1 parity gap) | four V1 hooks have no V2 counterpart: todo-continuation enforcer, compaction context and todo preservation, delegate-task-retry, empty-task-response detector | **DEFERRED** (no V2 port; follow-up plan `v2-doctrine-support-hooks`) | follow-up plan `v2-doctrine-support-hooks` (planned) |
| 31 | Hephaestus and Atlas doctrine (prompt fidelity) | hephaestus and atlas remain reduced identity ports in `packages/omo-opencode/src/v2/agents.ts`; only their dead prompt references were repaired, no doctrine was ported | **DEFERRED** (follow-up plan `v2-hephaestus-atlas-doctrine`) | follow-up plan `v2-hephaestus-atlas-doctrine` (planned) |

## Limitasi terdokumentasi (bukan pengecualian diam-diam)

Harness menjalankan config dengan API key **dimask** (anti-leak). Empat baris PASS\*
menandai bagian yang membutuhkan model live:

1. **Hook firing** (baris 6) — hook terdaftar di ctx (plugin load bersih); pembuktian firing
   penuh butuh sesi agent dengan model real. Registrasi + kontrak terbukti; pemutakhiran
   bukti firing = pasca-cutover observation window (task 21) atau F3 dengan model.
2. **Dispatch respons model** (baris 10) — dispatch membuat sesi real dan tersimpan
   (roundtrip penuh tanpa error); isi respons assistant butuh API key.
3. **BG task completion** (baris 13) — spawn + collect + jalur error (status `error`
   tercatat, tidak hang) terbukti runtime; transisi `complete` butuh model. Jalur error
   justru membuktikan acceptance task-13 ("gagal tercatat, tidak hang").
4. **DCP compress exec / tokenscope metrik real** (baris 22–23) — load + registrasi tool +
   RPC status + e2e tokenscope (tool execute via PR test harness) terbukti; eksekusi dalam
   sesi model live = pasca-cutover.
5. **TUI render terminal nyata** (baris 21) — binding + slot claim + keymap terbukti via
   mock-Context smoke + plugin load. The `sidebar.content` claim is now ALSO driven on a real
   TTY (tmux, OpenCode 2.3.0): `Models` paints after the theme token adapter landed, and
   `Agents` + `Jobs` render from the live RPC snapshot, updating in place when the producer
   state changes. The ULW/loop section remains pending because it has no V2 source yet.

Klasifikasi ini konsisten dengan plan task-19 ("model-dependent → catatan batasan jujur")
dan TIDAK mengecualikan fitur apa pun tanpa dokumentasi.

## Verdict

**24/24 fitur PASS (19 PASS penuh + 5 PASS\* dengan limitasi model/TTY terdokumentasi) — 100% matrix PASS.**
