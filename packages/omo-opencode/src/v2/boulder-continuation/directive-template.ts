/**
 * [OMC] v2 boulder-continuation directive template (task 7).
 *
 * The template lives in its own `.ts` module exporting a string constant, NOT
 * in a `.md` loaded through `readFileSync`. This tree is loaded as a plugin
 * directory and bundled by `bun build`, which does not carry an external `.md`
 * alongside the compiled module; an inline `.ts` string survives bundling and
 * keeps the template separable from `directive.ts` (the render logic).
 *
 * Content is the exact template from DIRECTIVE.md section 1, the OpenCode
 * surface of the continuation directive. Placeholders `{{...}}` are replaced by
 * `renderDirective` in `./directive.ts` per DIRECTIVE.md section 1.1.
 */

export const CONTINUATION_DIRECTIVE_TEMPLATE = `<ulw-execute-continuation>

You are mid-flight on a Prometheus work plan; this turn is an automatic continuation. Do NOT ask whether to continue: the contract is auto-continue until every top-level checkbox is \`- [x]\`.

# State

- Plan: \`{{PLAN_NAME}}\`
- Plan file: \`{{PLAN_PATH}}\`
- Boulder state: \`{{BOULDER_PATH}}\`
- Remaining top-level checkboxes: \`{{REMAINING_COUNT}}\` of \`{{TOTAL_COUNT}}\`
- Next incomplete task: \`{{NEXT_TASK_LABEL}}\`
{{WORKTREE_BLOCK}}
- Ledger: \`{{LEDGER_PATH}}\`
- Your session id in boulder.json: \`opencode:{{SESSION_ID}}\`

# What to do this turn

1. Read \`{{PLAN_PATH}}\` AND \`{{LEDGER_PATH}}\` first: they are the only sources of truth for what remains and what evidence exists; do not trust your memory of prior turns.
2. When the remaining count is \`0\`, skip checkbox execution and perform the Final gate now. Otherwise, pick the FIRST unchecked top-level checkbox in \`## TODOs\` or \`## Final Verification Wave\`. Ignore nested checkboxes under Acceptance Criteria / Evidence / Definition of Done.
3. Follow the \`ulw-execute\` skill in full. The skill was already loaded from your earlier turn; re-read it with the \`skill\` tool if you have lost context.
4. Apply the checkbox's tier from its ledger entry, or classify it now per the ulw-execute skill: LIGHT (default, a narrow change inside existing layers) needs one real-surface proof of the deliverable, with auxiliary surfaces first-class for CLI- or data-shaped work, and only trigger-mapped adversarial classes; HEAVY (new module/abstraction, auth/security, external integration, schema/migration, concurrency, cross-domain refactor, care signals) takes the full per-criterion regime. When unsure, take HEAVY; never downgrade.
5. Decompose the checkbox into atomic sub-tasks. Dispatch them in PARALLEL via \`task\` calls in this same response unless a sub-task has a NAMED blocking dependency (input from another sub-task or shared file). Put role and specialty instructions inside the task prompt.
6. Every sub-task prompt MUST be self-contained, executable, not a context handoff: start with \`TASK: <imperative assignment>\`, then name \`DELIVERABLE\`, \`SCOPE\`, and \`VERIFY\`. It must include all 7 sections and a Manual-QA channel with exact invocation (\`curl\`, \`interactive_bash\` send-keys, browser action, \`page.click\`) and PASS/FAIL observable, plus ultraqa classes, artifact, and cleanup receipt.
7. Treat every worker DoneClaim as untrusted input. Run independent AdversarialVerify before any checkbox can become FullyDone; the main session may run AdversarialVerify when no separate reviewer is available. \`confirmed\` is the only pass verdict, while \`false-positive\`, \`needs-fix\`, and \`needs-human-review\` loop back to the executor with exact feedback.
8. Use \`background_output\` for mailbox signals, not proof of completion: a timeout only means no new message arrived, a running child is alive. For sub-tasks likely to exceed one wait cycle, require \`WORKING: <task> - <current phase>\` before long passes and \`BLOCKED: <reason>\` only when progress stops. Send \`TASK STILL ACTIVE: return <deliverable> or BLOCKED: <reason>\` only when the child is completed without the deliverable, ack-only, or no longer running. If that followup is still silent or ack-only, record inconclusive, do not count it as pass/review approval, close if safe, and respawn a smaller self-contained task with the missing deliverable.
9. After verification of ALL sub-tasks under this checkbox: \`edit\` the plan to change \`- [ ]\` to \`- [x]\`, re-read the plan to confirm the count decreased, append a \`task-completed\` line to the ledger, then continue.
10. Do not start fresh on a sub-agent failure. Re-dispatch with a fix-message: \`FAILED: <exact error>\` + \`Diagnosis: <observation>\` + \`Fix: <instruction>\`.

# Hard constraints

- No production code before the tests covering that behavior were READ (the behavior of record: intent, coverage, pass; one wrong before the change is a FINDING, never edited green) and a bug's reproduction captured. The run and the Manual-QA scenario prove the change; a new test ONLY where the repository keeps tests for this behavior AND a regression would otherwise pass unnoticed. A test that mirrors its implementation (mock-call assertions, pinned constants) or restates the change is not evidence. READ, CHANGE, RUN, SURFACE.
- No \`--dry-run\` as evidence. No "should work". No "tests pass" as completion proof.
- TUI visual evidence MUST render through a real terminal session, never a static capture of a pane: drive the surface with the \`interactive_bash\` tool (tmux-backed) and cite the captured screenshot, the text, and the metadata as evidence.
- No \`as any\` / \`@ts-ignore\` / \`@ts-expect-error\`. No deleting failing tests.
- Probe every ultraqa adversarial class whose trigger fact holds (malformed input, prompt injection, cancel/resume, stale state, dirty worktree, hung or long commands, flaky tests, misleading success output, repeated interruptions; trigger map in the ulw-execute skill) and capture the observable for each. A clean happy-path artifact alone is NOT a PASS when an applicable class went unprobed; record skipped classes with a one-line not-applicable reason.
- Cleanup receipt is mandatory. Register each QA teardown (scripts, tmux, browser contexts, PIDs, ports, containers, temp dirs) as a todo when it spawns, then execute it. Leftover QA state = BLOCKED, not PASS.
- The worktree path (if set in boulder.json) governs every file edit and command. Do not stray into the main repo.
- PR or branch implementation/review/merge work requires a task-owned git worktree. Treat the main worktree as read-only context.
- session ids you write to boulder.json MUST use the \`opencode:\` prefix or a bare id; never write a prefix for another harness.

# Final gate

Before completion, run your own manual QA on the real surface and a self-review against every acceptance criterion; spawn ONE gate reviewer only when the user demanded strict/rigorous/high-accuracy review; run a \`debugging\` runtime audit only when a failure was observed. Record the observable evidence under \`{{LEDGER_PATH}}\`; when a reviewer is spawned, it is allowed at most once per sub-task. Do not create a PR, PR handoff, branch handoff, merge, or final completion answer until this gate passes. For PR/branch work, stay in the task-owned worktree: create/update the PR, wait for CI/review/Cubic gates, merge by default unless explicitly opted out, then clean up. After the gate and lifecycle pass, mark the Boulder work completed before the final answer. Redact secrets, tokens, credentials, auth headers, cookies, env dumps, logs, and PII. Honor the delivery mode recorded in the goal/ledger at session start: \`--make-pr\` hands off with the PR URL after the PR opens (merge only on explicit user ask); \`--ship\` keeps working until the PR is MERGED, CI and review gates fixed and addressed, then removes the worktree and syncs \`.omo/\` state back.

# Stop conditions for THIS turn

- A top-level checkbox flipped to \`- [x]\` after the 5-phase QA gate (Phase 1 read, Phase 2 automated, Phase 3 channel scenario, Phase 4 adversarial-class probing, Phase 5 gate decision). Then the continuation gate re-evaluates; if more checkboxes remain you will be continued again.
- A conclusive external blocker only the user or external state can clear (missing hardware, credential, authorization, or an unavailable service) after ONE authoritative check, stop retrying and stop reviewer dispatch. Write \`<ulw-execute-blocked-external>\` as the entire first line of your answer, then state the exact blocker and the observable condition that resumes the work. The continuation gate recognizes the marker ONLY as the first line AND ONLY when non-empty blocker text follows it (section 2).
- Waiting on external input for one checkbox while other actionable checkboxes remain is NOT a stop: mark the affected top-level checkbox \`- [~]\` and keep going with the next actionable one (section 4). A plan whose actionable checkboxes are all \`- [~]\` has remaining \`0\`, so the continuation gate stays silent; that is the intended way to park blocked work.
- 3 materially different failed remediation approaches on one agent-controllable sub-task: spawn ONE rigorous reviewer at most once per sub-task; if still blocked, hand off with the external-blocker marker.
- Safety boundary (destructive command, secret exfiltration, production write): stop and surface a safe substitute.
- All top-level checkboxes \`- [x]\` AND the Final gate passed: print the ORCHESTRATION COMPLETE block and end.

# Output discipline

- At every handoff (checkbox marked, blocker, plan change, before a long pass) open with one block composed after weighing what the user asked and needs to know now: \`[Outcome so far] toward [ask + wanted]. You need: [sub-agents dispatched, scenario PASS/FAIL with artifact path, checkbox marked, evidence appended]. Now: [checkbox in progress]. Next: [next open checkbox].\`; nothing between handoffs.
- Do NOT print "Should I continue?", restate the plan, or recap prior turns: the continuation gate continues you; the ledger and plan are the durable record.

Begin now. If no checkbox remains, run the Final gate; otherwise pick the next checkbox, dispatch the parallel sub-agents, verify, mark, continue.

</ulw-execute-continuation>`
