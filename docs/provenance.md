# Provenance & License Compliance — omo-v2 (opencode v2 port)

This fork exists solely to port [oh-my-openagent](https://github.com/code-yeongyu/oh-my-openagent)
(OMC) from the OpenCode **V1** plugin line (`@opencode-ai/plugin` 1.18.x) to the **V2** line
(`@opencode/*` 2.0.22). Repository visibility is **public by owner decision** (2026-10-01);
npm publishing and upstream pushes remain forbidden.

## 1. Upstream provenance

| Field | Value |
|---|---|
| Upstream repository | `https://github.com/code-yeongyu/oh-my-openagent` |
| Base commit | `d1317056ebdea8d22664f87046628f105a8be58f` |
| Base commit subject | `Merge pull request #9231 from code-yeongyu/release/v5.1.4-source-state` |
| Tag at base commit | `v5.1.4` |
| Upstream license | Sustainable Use License 1.0 (SUL-1.0) |
| Fork remote (`origin`) | `https://github.com/fede-ciliberti/omo-v2` (**public**; GitHub fork of the source fork below) |
| Source fork (`fazulfi`) | `https://github.com/fazulfi/omo-v2` — wrote the original port on branch `port/v2`; read-only here |
| Legacy fork (`omo-v1`) | `https://github.com/fede-ciliberti/oh-my-openagent` — holds the V1 line; its `v2` branch was deleted 2026-10-24 |
| Upstream remote (`upstream`) | fetch-only; **push is forbidden** |

### Provenance file hashes (sha256, verified at base commit)

| File | sha256 |
|---|---|
| `LICENSE.md` | `b61ac928f152d13517328263e6bee9175b928f9ab696a2d2ca2b6cfd961ddc32` |
| `THIRD-PARTY-NOTICES.md` | `5cba3d05e48cb53d89acaf701ff727bc09a571b0b35f2ce71c9737a79901ab1b` |
| `README.md` | `63a187a3361bc972ba483f72cea76aae7ce72194611bae03020ab11e56e3f2bd` |

`LICENSE.md` and `THIRD-PARTY-NOTICES.md` (and all embedded copyright/attribution notices)
must remain **unaltered** in every commit of this fork. Do not edit, remove, or obscure them.

## 2. SUL-1.0 compliance verdict

Relevant license terms (`LICENSE.md`, lines 26–28):

> "You may use or modify the software only for your own internal business purposes or for
> non-commercial or personal use. You may distribute the software or provide it to others
> only if you do so free of charge for non-commercial purposes. You may not alter, remove,
> or obscure any licensing, copyright, or other notices of the software."

Analysis:

- The license text contains **no dollar revenue threshold**. The gate is the *mode of use*:
  internal business use and non-commercial use are permitted; distribution is permitted only
  free-of-charge for non-commercial purposes; notices must stay intact.
- This fork is used exclusively as **internal tooling** for the owner's business (zrouter /
  zcloud development orchestration). OMC is not redistributed to customers, not embedded in
  any shipped product, and not resold.
- **Verdict: PASS** — internal tooling, source published free of charge with intact notices;
  compliant with SUL-1.0.
- **Publication decision (owner, 2026-10-01)**: the owner explicitly approved public
  visibility for this fork ("gpp public"). SUL-1.0 permits free-of-charge non-commercial
  distribution; a public source repository with intact notices satisfies that mode. The
  repository therefore runs public by owner decision.
- **Still prohibited** (unchanged): pushing to `upstream`, npm publishing (publishing under
  a package name implies a distribution channel the owner has not sanctioned), and removing
  or altering license/attribution notices.

## 3. Toolchain pin (opencode v2 target)

All port work targets the **official V2 packages at exactly `2.0.22`** (no `^`/`~` ranges),
which is what `package.json` and `bun.lock` pin today:

| Package | Pinned version |
|---|---|
| `@opencode/plugin` | `2.0.22` |
| `@opencode/client` | `2.0.22` |

The host CLI is not a dependency: the port is verified against whichever `opencode` binary the
developer has installed (2.1.3 at the time of writing).

Rules:

- **Forbidden imports**: `@opencode-ai/plugin/v2/*` and `@opencode-ai/sdk/v2` (V1-line
  bridge subpaths, not the port target). The static parity gate must show **zero**
  `@opencode-ai/*` imports in fork `packages/*/src` once the port is complete.
- **Forbidden packages**: any third-party npm package named `opencode2` (not an official
  product). Note: the official OpenCode CLI ships its own bin alias `opencode2` — that alias
  is fine.
- The V1-line devDependencies (`@opencode-ai/plugin` 1.18.31, `@opencode-ai/sdk` 1.18.31)
  were swapped for the pinned V2 packages in the retarget commit `f142f5eac2`; `package.json`
  and `bun.lock` carry no `@opencode-ai/*` entries today. CI installs with
  `--frozen-lockfile`, so `package.json` is only edited in the same change as the lockfile
  regeneration.
- Static parity gate status (2026-10-24): **0** files importing `@opencode-ai/*` under
  `packages/*/src`.

## 4. Port conventions

- Port basis: `packages/omo-opencode/src` (authored source). Never port from
  `dist/index.js` (178k-line vendor bundle).
- All changes flow through branch `v2` in `fede-ciliberti/omo-v2` (conventional commits,
  auditable descriptions). `main` stays at the upstream base snapshot; `port/v2` lives in the
  source fork `fazulfi/omo-v2`.
- Isolated V2 test harness: see `docs/v2-isolation.md` (moved from the interim port
  workspace). Production V1 (binary 1.18.33, user config, plugin cache) is immutable
  outside sanctioned changes.
