# DIRECTIVE.md: directive render, external-blocker marker y valvula de presion de contexto (V2)

Doc de diseno para el modulo `packages/omo-opencode/src/v2/boulder-continuation/` (todos T3 -> T7).
Especifica, sin codigo ni tests, tres cosas: (1) la plantilla exacta de la directiva que el gate inyecta por
`session.synthetic`, (2) el protocolo del marcador `<ulw-execute-blocked-external>` y (3) la valvula de presion
de contexto adaptada al harness OpenCode. Un revisor tiene que poder implementar T7 (render + marker/valve ports +
inyeccion) solo con este documento.

Regla de autoridad: la unica adaptacion permitida respecto del componente de continuacion de la edicion Light
hermana es la superficie del harness (nombres de tools de OpenCode, sin referencias a la superficie del otro
harness, sin su prosa de host). La redaccion de la directiva no cambia mas alla de eso. La ruta del componente de
referencia se omite a proposito para que el gate de adaptacion de harness (grep case-insensitive por el nombre del
otro harness) quede vacio; el lector la tiene en las referencias de T3/T7 del plan.

No se escriben tests de asercion sobre la prosa de la directiva. T7 testea solo sustitucion de placeholders y
campos consumidos por maquina (booleanos del marker y de la valvula).

---

## 1. Plantilla de la directiva (exacta)

Placeholders entre `{{ }}`. Se sustituyen con `replaceAll`. Es la version OpenCode de la plantilla del componente
Light; los unicos cambios respecto de esa base son la superficie del harness (nombres de tools, ids de sesion) y la
frase de `[~]` (seccion 4). El bloque `{{WORKTREE_BLOCK}}` ocupa una linea propia y se resuelve a cadena vacia
cuando el work no tiene worktree (ver tabla).

```text
<ulw-execute-continuation>

You are mid-flight on a Prometheus work plan; this turn is an automatic continuation. Do NOT ask whether to continue: the contract is auto-continue until every top-level checkbox is `- [x]`.

# State

- Plan: `{{PLAN_NAME}}`
- Plan file: `{{PLAN_PATH}}`
- Boulder state: `{{BOULDER_PATH}}`
- Remaining top-level checkboxes: `{{REMAINING_COUNT}}` of `{{TOTAL_COUNT}}`
- Next incomplete task: `{{NEXT_TASK_LABEL}}`
{{WORKTREE_BLOCK}}
- Ledger: `{{LEDGER_PATH}}`
- Your session id in boulder.json: `opencode:{{SESSION_ID}}`

# What to do this turn

1. Read `{{PLAN_PATH}}` AND `{{LEDGER_PATH}}` first: they are the only sources of truth for what remains and what evidence exists; do not trust your memory of prior turns.
2. When the remaining count is `0`, skip checkbox execution and perform the Final gate now. Otherwise, pick the FIRST unchecked top-level checkbox in `## TODOs` or `## Final Verification Wave`. Ignore nested checkboxes under Acceptance Criteria / Evidence / Definition of Done.
3. Follow the `ulw-execute` skill in full. The skill was already loaded from your earlier turn; re-read it with the `skill` tool if you have lost context.
4. Apply the checkbox's tier from its ledger entry, or classify it now per the ulw-execute skill: LIGHT (default, a narrow change inside existing layers) needs one real-surface proof of the deliverable, with auxiliary surfaces first-class for CLI- or data-shaped work, and only trigger-mapped adversarial classes; HEAVY (new module/abstraction, auth/security, external integration, schema/migration, concurrency, cross-domain refactor, care signals) takes the full per-criterion regime. When unsure, take HEAVY; never downgrade.
5. Decompose the checkbox into atomic sub-tasks. Dispatch them in PARALLEL via `task` calls in this same response unless a sub-task has a NAMED blocking dependency (input from another sub-task or shared file). Put role and specialty instructions inside the task prompt.
6. Every sub-task prompt MUST be self-contained, executable, not a context handoff: start with `TASK: <imperative assignment>`, then name `DELIVERABLE`, `SCOPE`, and `VERIFY`. It must include all 7 sections and a Manual-QA channel with exact invocation (`curl`, `interactive_bash` send-keys, browser action, `page.click`) and PASS/FAIL observable, plus ultraqa classes, artifact, and cleanup receipt.
7. Treat every worker DoneClaim as untrusted input. Run independent AdversarialVerify before any checkbox can become FullyDone; the main session may run AdversarialVerify when no separate reviewer is available. `confirmed` is the only pass verdict, while `false-positive`, `needs-fix`, and `needs-human-review` loop back to the executor with exact feedback.
8. Use `background_output` for mailbox signals, not proof of completion: a timeout only means no new message arrived, a running child is alive. For sub-tasks likely to exceed one wait cycle, require `WORKING: <task> - <current phase>` before long passes and `BLOCKED: <reason>` only when progress stops. Send `TASK STILL ACTIVE: return <deliverable> or BLOCKED: <reason>` only when the child is completed without the deliverable, ack-only, or no longer running. If that followup is still silent or ack-only, record inconclusive, do not count it as pass/review approval, close if safe, and respawn a smaller self-contained task with the missing deliverable.
9. After verification of ALL sub-tasks under this checkbox: `edit` the plan to change `- [ ]` to `- [x]`, re-read the plan to confirm the count decreased, append a `task-completed` line to the ledger, then continue.
10. Do not start fresh on a sub-agent failure. Re-dispatch with a fix-message: `FAILED: <exact error>` + `Diagnosis: <observation>` + `Fix: <instruction>`.

# Hard constraints

- No production code before the tests covering that behavior were READ (the behavior of record: intent, coverage, pass; one wrong before the change is a FINDING, never edited green) and a bug's reproduction captured. The run and the Manual-QA scenario prove the change; a new test ONLY where the repository keeps tests for this behavior AND a regression would otherwise pass unnoticed. A test that mirrors its implementation (mock-call assertions, pinned constants) or restates the change is not evidence. READ, CHANGE, RUN, SURFACE.
- No `--dry-run` as evidence. No "should work". No "tests pass" as completion proof.
- TUI visual evidence MUST render through a real terminal session, never a static capture of a pane: drive the surface with the `interactive_bash` tool (tmux-backed) and cite the captured screenshot, the text, and the metadata as evidence.
- No `as any` / `@ts-ignore` / `@ts-expect-error`. No deleting failing tests.
- Probe every ultraqa adversarial class whose trigger fact holds (malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions; trigger map in the ulw-execute skill) and capture the observable for each. A clean happy-path artifact alone is NOT a PASS when an applicable class went unprobed; record skipped classes with a one-line not-applicable reason.
- Cleanup receipt is mandatory. Register each QA teardown (scripts, tmux, browser contexts, PIDs, ports, containers, temp dirs) as a todo when it spawns, then execute it. Leftover QA state = BLOCKED, not PASS.
- The worktree path (if set in boulder.json) governs every file edit and command. Do not stray into the main repo.
- PR or branch implementation/review/merge work requires a task-owned git worktree. Treat the main worktree as read-only context.
- session ids you write to boulder.json MUST use the `opencode:` prefix or a bare id; never write a prefix for another harness.

# Final gate

Before completion, run your own manual QA on the real surface and a self-review against every acceptance criterion; spawn ONE gate reviewer only when the user demanded strict/rigorous/high-accuracy review; run a `debugging` runtime audit only when a failure was observed. Record the observable evidence under `{{LEDGER_PATH}}`; when a reviewer is spawned, it is allowed at most once per sub-task. Do not create a PR, PR handoff, branch handoff, merge, or final completion answer until this gate passes. For PR/branch work, stay in the task-owned worktree: create/update the PR, wait for CI/review/Cubic gates, merge by default unless explicitly opted out, then clean up. After the gate and lifecycle pass, mark the Boulder work completed before the final answer. Redact secrets, tokens, credentials, auth headers, cookies, env dumps, logs, and PII. Honor the delivery mode recorded in the goal/ledger at session start: `--make-pr` hands off with the PR URL after the PR opens (merge only on explicit user ask); `--ship` keeps working until the PR is MERGED, CI and review gates fixed and addressed, then removes the worktree and syncs `.omo/` state back.

# Stop conditions for THIS turn

- A top-level checkbox flipped to `- [x]` after the 5-phase QA gate (Phase 1 read, Phase 2 automated, Phase 3 channel scenario, Phase 4 adversarial-class probing, Phase 5 gate decision). Then the continuation gate re-evaluates; if more checkboxes remain you will be continued again.
- A conclusive external blocker only the user or external state can clear (missing hardware, credential, authorization, or an unavailable service) after ONE authoritative check, stop retrying and stop reviewer dispatch. Write `<ulw-execute-blocked-external>` as the entire first line of your answer, then state the exact blocker and the observable condition that resumes the work. The continuation gate recognizes the marker ONLY as the first line AND ONLY when non-empty blocker text follows it (section 2).
- Waiting on external input for one checkbox while other actionable checkboxes remain is NOT a stop: mark the affected top-level checkbox `- [~]` and keep going with the next actionable one (section 4). A plan whose actionable checkboxes are all `- [~]` has remaining `0`, so the continuation gate stays silent; that is the intended way to park blocked work.
- 3 materially different failed remediation approaches on one agent-controllable sub-task: spawn ONE rigorous reviewer at most once per sub-task; if still blocked, hand off with the external-blocker marker.
- Safety boundary (destructive command, secret exfiltration, production write): stop and surface a safe substitute.
- All top-level checkboxes `- [x]` AND the Final gate passed: print the ORCHESTRATION COMPLETE block and end.

# Output discipline

- At every handoff (checkbox marked, blocker, plan change, before a long pass) open with one block composed after weighing what the user asked and needs to know now: `[Outcome so far] toward [ask + wanted]. You need: [sub-agents dispatched, scenario PASS/FAIL with artifact path, checkbox marked, evidence appended]. Now: [checkbox in progress]. Next: [next open checkbox].`; nothing between handoffs.
- Do NOT print "Should I continue?", restate the plan, or recap prior turns: the continuation gate continues you; the ledger and plan are the durable record.

Begin now. If no checkbox remains, run the Final gate; otherwise pick the next checkbox, dispatch the parallel sub-agents, verify, mark, continue.

</ulw-execute-continuation>
```

### 1.1 Tabla de placeholders

El render reemplaza cada `{{PLACEHOLDER}}` por su valor. Fuente = campo del estado de continuacion del work
(equivalente a `ContinuationState` del componente de referencia).

| Placeholder | Fuente | Regla de render |
| --- | --- | --- |
| `{{PLAN_NAME}}` | nombre del plan del work | valor tal cual |
| `{{PLAN_PATH}}` | ruta del archivo de plan del work | valor tal cual |
| `{{BOULDER_PATH}}` | ruta de `.omo/boulder.json` | valor tal cual |
| `{{REMAINING_COUNT}}` | `checklist.remaining` | `String(...)` |
| `{{TOTAL_COUNT}}` | `checklist.total` | `String(...)` |
| `{{NEXT_TASK_LABEL}}` | `checklist.nextTaskLabel` | si es `null` (remaining `0`), renderiza `none (final gate pending)` |
| `{{WORKTREE_BLOCK}}` | `worktreePath` | si hay worktree: `"\n- Worktree: \`<path>\` (all edits, tests, and commands run inside this directory)"`; si no: cadena vacia. El bloque vive en su propia linea en la plantilla |
| `{{LEDGER_PATH}}` | ruta del ledger del work | valor tal cual |
| `{{SESSION_ID}}` | id de sesion del turno | id **bare**; la plantilla antepone `opencode:` |

Notas de render para T7:
- `WORKTREE_BLOCK` es el unico placeholder multilinea; los demas son de una linea.
- El prefijo `opencode:` esta en la plantilla, no en el valor: el valor es el id bare. Asi el render nunca compone
  un prefijo de otro harness.

---

## 2. Protocolo del marcador `<ulw-execute-blocked-external>`

Constante: `EXTERNAL_BLOCKER_MARKER = "<ulw-execute-blocked-external>"`.

Regla de reconocimiento (espejo del componente de referencia, lineas 50-61). El marcador se reconoce como stop
legitimo SOLO si se cumplen las dos condiciones juntas:

1. La **primera linea** del ultimo mensaje del asistente, con `trim()`, es **exactamente igual** al marcador
   (igualdad exacta, no `includes`).
2. **Al menos una linea posterior** tiene contenido no vacio tras `trim()` (el texto del blocker). El marcador
   solo, sin texto, es **insuficiente** y la continuacion sigue.

Fundamento: un eco pelado del marcador (citado de un prompt o producido por texto no confiable que el agente leyo)
no debe poder saltar el guard de continuacion. Exigir el bloqueador no vacio obliga a una accion deliberada.

Fuente del "ultimo mensaje del asistente" para el chequeo: la entrada mas reciente `type: "assistant"` de
`client.message.list({ sessionID, type: "assistant", order: "desc", limit: 1 })`; el texto evaluado es la
concatenacion de las partes de contenido `type === "text"` de esa entrada.

### 2.1 Variante de segunda linea: DROPPED

El componente de referencia reconoce una segunda forma: el marcador como **segunda linea**, inmediatamente despues
de una primera linea obligatoria de apertura de modo ultrawork (`ULTRAWORK MODE ENABLED!`). **Esa variante se
descarta en OpenCode.** Razon: esa primera linea obligatoria es propia del modo ultrawork del otro harness; el
camino de continuacion de OpenCode no fuerza ninguna linea de apertura dentro del mensaje del asistente, asi que no
existe una posicion de "segunda linea" que reconocer. En OpenCode el marcador MUST ser la primera linea; el
reconocimiento en cualquier otra posicion se rechaza.

---

## 3. Valvula de presion de contexto (adaptada)

Proposito: valvula de seguridad contra un loop de continuacion infinito una vez agotada la ventana de contexto. Si
hay presion de contexto, el gate NO inyecta, loguea el motivo y no consume cap.

### 3.1 Substrings retenidos (host-agnosticos)

Conjunto retenido, exactamente estos tres, matcheados case-insensitive sobre el texto del transcript:

```
context_length_exceeded
context_too_large
context compacted
```

Constante: `CONTEXT_PRESSURE_MARKERS = ["context_length_exceeded", "context_too_large", "context compacted"]`.

### 3.2 Dropeado (prosa de host)

Se descarta el marcador de prosa propio del host anterior que nombra la ventana de contexto agotada del modelo. Esa
frase no puede aparecer en este harness: mantenerla seria peso muerto. Cualquier otra frase del componente de
referencia que no este en la lista de 3.1 tampoco se arrastra: el conjunto retenido es exactamente 3.1.

### 3.3 Senal de presion V2-native (ADDED)

Fuente exacta del transcript: **`message.list`**.

Lectura autoritativa en el momento de decidir (en el gate, tras `session.execution.succeeded`):

```
client.message.list({ sessionID, order: "desc", limit: PRESSURE_SCAN_LIMIT })
```

- `PRESSURE_SCAN_LIMIT = 20` (constante del modulo).
- Devuelve `SessionMessagesResponse` = `{ data: SessionMessageInfo[], cursor }`. Cada entrada tiene un
  discriminante `type`.

Hay presion de contexto si se cumple CUALQUIERA de:

1. Existe una entrada `type: "compaction"` con `status: "completed"` en las ultimas `PRESSURE_SCAN_LIMIT` entradas
   (ocurrio una compactacion).
2. Existe una entrada `type: "assistant"` con `finish: "length"` (el turno se corto por el limite de longitud).
3. El texto concatenado de las ultimas `PRESSURE_SCAN_LIMIT` entradas, pasado a minusculas, contiene alguno de los
   substrings de 3.1. El texto por entrada:
   - `type: "assistant"`: cada parte de contenido con `type === "text"` aporta su `text`.
   - `type: "user"`: aporta su `text`.
   - `type: "compaction"`: aporta `summary` + `recent`.

Trigger event-driven (optimizacion, NO autoritativo): suscribirse a `session.compaction.ended` y marcar un flag de
presion por `sessionID`. La lectura de `message.list` sigue siendo la fuente de verdad porque el evento puede
perderse a traves de un reinicio del host.

Contrato del port para T7 (`markers.ts`):
- `hasAllowedExternalBlockerMarker(lastAssistantMessage: string | undefined): boolean` (seccion 2).
- `transcriptHasContextPressureMarker(messages: SessionMessageInfo[]): boolean` (seccion 3.1 + 3.3, items 1-3).

---

## 4. Instruccion de `[~]` (espera de input externo)

La directiva instruye al agente a marcar `- [~]` cuando queda esperando input externo para un checkbox mientras
hay otros accionables. Semantica (plan-checklist.ts:19-21, 126-131, 207): `[~]` cuenta hacia `total` unicamente,
ni `completed` ni `remaining`. Consecuencia: un plan cuyos checkboxes accionables quedaron todos en `[~]` tiene
`remaining === 0`, entonces el gate de continuacion no dispara y el turno puede terminar. Ese es el mecanismo
previsto para estacionar trabajo bloqueado sin inventar estados nuevos.

La instruccion vive en la plantilla (seccion 1, "# Stop conditions for THIS turn", tercer bullet) y su redaccion
exacta es parte de la plantilla. No hay un estado `BoulderWorkStatus` nuevo: `[~]` ya cubre "bloqueado".

---

## 5. Contrato minimo para implementar T7 desde este doc

- `directive.ts`: cargar la plantilla de la seccion 1 desde un archivo (no inline en TS) y renderizar por
  `replaceAll` segun la tabla 1.1. `NEXT_TASK_LABEL` con `null` -> `none (final gate pending)`; `WORKTREE_BLOCK`
  vacio cuando no hay worktree.
- `markers.ts`: `hasAllowedExternalBlockerMarker` (seccion 2, marcador + texto no vacio, solo primera linea) y
  `transcriptHasContextPressureMarker` (seccion 3.1 + 3.3). Sin la variante de segunda linea (2.1).
- `inject.ts`: `injectContinuation(session, text, description, metadata)` llamando SOLO a `ctx.session.synthetic`
  con `delivery: "steer"` y `resume` default; devuelve el `SessionInboxSynthetic.id` admitido para autoatribucion y
  registra `notice: "omo-boulder-continuation"`. Cero llamadas al prompt crudo de sesion en el modulo (gate de T7: la unica via es la inyeccion sintetica).
- Sin tests de asercion sobre la prosa de la directiva: solo sustitucion de placeholders y booleanos del marker y
  de la valvula.

## 6. Gate de verificacion

El gate de adaptacion de harness (grep case-insensitive por el nombre del otro harness) debe devolver vacio. Este
doc no contiene ninguna referencia a la superficie del otro harness ni a su prosa de host; la ruta del componente
de referencia se omite a proposito y el lector la encuentra en las referencias de T3/T7 del plan.
