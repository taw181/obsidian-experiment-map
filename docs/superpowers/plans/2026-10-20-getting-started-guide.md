# Getting started guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A right-sidebar guide that walks a new user through building a six-step practice map in its own folder, ticking tasks as their notes show them done, plus a Real / Practice switch in the map view.

**Architecture:** Step definitions, checks, progress and hints are pure functions in `src/core/guide.js` over the `buildGraph()` result, so they can be checked from Node. The plugin gains an "active map" (real or practice) that decides which `Config.md` the view and commands load; per-machine state (active map, guide progress) goes in Obsidian's local storage, never in the vault. A new `GuideView` loads the practice graph on its own and renders the steps with Obsidian's Markdown renderer.

**Tech Stack:** Plain JavaScript ES modules, Obsidian API (`ItemView`, `Modal`, `MarkdownRenderer`), esbuild with `.md` text loader.

**Spec:** `docs/superpowers/specs/2026-10-20-getting-started-guide-design.md`

## Global Constraints

- No test files (maintainer's rule). Verify with throwaway `node --input-type=module -e` checks of `src/core`, the CLI (`node cli.js --vault <scratch> --config "Experiment map practice/Config.md" check`), and a scratch vault.
- Nothing lab-specific in `src/` or `templates/`; the practice values (`Practice laser`, `Laser table`, `practice`, …) are generic placeholders and are fine.
- Generated files deterministic; nothing written in the background except what already is (layout after drag, sync outputs).
- Practice folder: `Experiment map practice/` with `Config.md`, `Components/`, `Models/`. Every practice component name starts with `Practice`.
- Guide progress and the active map are per machine and must not be written into the vault (`.obsidian/plugins/experiment-map/data.json` is committed in shared vaults).
- `minAppVersion` stays `1.5.0`.
- Update `docs/design.md`, `README.md`, `templates/README.md`.
- Work on branch `getting-started-guide`; don't merge or tag.

## Review Focus

- **Switching maps within a second of a drag**: the pending `layout.json` save must go to the map that was dragged, not the newly shown one (Task 2: `LayoutStore.flush()` before `setPath`).
- **Reset while the practice map is showing**: positions from the previous run must not come back (Task 2: `LayoutStore.discard()` in reset).
- **Names typed with different capitals or trailing spaces** (`Practice aom`): the task stays unticked *and* the panel says why (Task 1: near-miss hint).
- **Practice folder removed by a git pull while it is the active map**, or the vault has no real map: the view falls back to the real map or its empty state, without an error loop (Task 2).
- **Stored progress after someone else's reset**: a finished step's component is gone → "practice map has changed" with Start over, nothing ticks (Task 1 `missingCreated`, Task 3 render).

---

### Task 1: Guide core — steps, checks, progress, hints, practice config

**Files:**
- Create: `src/core/guide.js`

**Interfaces:**
- Produces:
  - `PRACTICE_DIR = 'Experiment map practice'`, `PRACTICE_CONFIG_PATH = 'Experiment map practice/Config.md'`
  - `STEPS: Array<{ id, title, tasks: Array<{ id, text, creates?, check(graph) -> boolean }>, why, lookFor, subjects: string[] }>` — `text`, `why`, `lookFor` are Markdown strings.
  - `practiceConfig(starterText: string) -> string`
  - `advance(progress, graph) -> progress` where `progress = { done: string[] }` (task ids `"<step>.<task>"`); returns a new object with every task of the *current* step whose check passes added, repeated until the current step has an unticked task that fails (so steps already satisfied fall through). Never removes ids.
  - `currentStep(progress) -> number` (index into `STEPS`; `STEPS.length` when finished); `isFinished(progress) -> boolean`
  - `missingCreated(progress, graph) -> string[]` — `creates` names of done tasks that are not in `graph.components`.
  - `hintsFor(stepIndex, graph) -> string[]` — Markdown hints for the step's `subjects`.

- [ ] **Step 1: Write the six steps as data.** Component names, types and locations exactly as the spec's table: `Practice laser` (`laser`, `Laser table`, experiment `practice`), `Practice chamber` (`destination`), `Practice AOM` (`aom`), `Practice VCO` (`rf_source`, `Laser table`, `practice`), `Practice control board` and `Practice PC` (`controller`, `Electronics rack`, `practice`), `Practice fibre` (`fibre`, `Laser table`, `output_location: Chamber table`), model `Practice AOM model`. One task per "Do" line; checks use `graph.components[name].props` (resolved) and `.inputs.beam/rf/control[].unit`:
  - step 1: `laser` (type, location, experiment includes `practice`; creates `Practice laser`), `chamber` (type `destination`, beam inputs include `Practice laser`; creates `Practice chamber`)
  - step 2: `aom` (type, `Laser table`, beam from laser; creates), `rewire` (chamber's beam inputs are exactly `[Practice AOM]`)
  - step 3: `vco`, `vco-link` (AOM rf includes VCO), `board`, `board-link` (VCO control includes board), `pc`, `pc-link` (board control includes PC)
  - step 4: `move` (chamber location `Chamber table`)
  - step 5: `fibre` (type, `Laser table`, beam from AOM; creates), `output` (`output_location` `Chamber table`), `rewire` (chamber beam exactly `[Practice fibre]`)
  - step 6: `props` (AOM's resolved `freq_shift_mhz` set and `manuals` non-empty), `model` (AOM's `model` is in `graph.models` with `props.type === 'aom'`)
  Copy: Do lines give exact values and the final property line as a code block (e.g. ```` ```yaml\nbeam_from: ["[[Practice AOM]]"]\n``` ````); Why and Look for a few sentences each, step 2's from the spec verbatim. Step 6's manual is `https://example.com/aom-manual.pdf`. Location matches compare trimmed strings exactly.

- [ ] **Step 2: Implement `practiceConfig(starterText)`.** Rewrite the frontmatter's four folder keys from `Experiment map` to `Experiment map practice` (`components_folder`, `models_folder`, `channels_folder`, `output_folder`), set `experiments: [practice]`, keep every other key line untouched, and replace the body with a short paragraph: this is the getting-started practice map; "Experiment map: Start getting started guide" resets it; the real map is elsewhere.

- [ ] **Step 3: Implement `advance`, `currentStep`, `isFinished`, `missingCreated`, `hintsFor`.** Hints, in order, for each name in the step's `subjects`:
  - not in `graph.components` but a component's name matches it after trim + lowercase → ``The guide expects a note called **Practice AOM**, but yours is **Practice aom**. Rename the note to match.``
  - each `graph.problems` entry with that subject, reworded: `/is not a link/` → put quotes round the link, like `"[[Practice laser]]"`; `/is not a component note/` → no component by that name: check spelling and capitals, or make it first; `/^no experiment/` → set `experiment` to `practice`; `/^unknown experiment/` → use `practice`; anything else → the message as is, prefixed with the subject.

- [ ] **Step 4: Verify with a scratch vault and Node.** Build a scratch vault in the scratchpad: write `Experiment map practice/Config.md` with `practiceConfig(<templates/Config.md text>)`, then write notes stage by stage (end state of steps 1, 2, …, 6, hand-written frontmatter as the steps describe, including step 6's model note as "Make model" would write it). After each stage run:
  ```sh
  node --input-type=module -e "import {loadInputs,buildOutputs} from './src/core/sync.js'; import {nodeIo} from './src/cli/node-io.js'; ..."
  ```
  (use whatever `node-io.js` exports) to build the graph and print `advance`/`currentStep` from the previous progress. Expected: progress reaches step index 1, 2, 3, 4, 5, then `isFinished` true; `missingCreated` empty throughout; `node cli.js --vault <scratch> --config "Experiment map practice/Config.md" check` prints no problems at the final stage. Also: rename `Practice AOM.md` to `Practice aom.md` at stage 2 → step 2 not complete and `hintsFor(1, g)` includes the "expects a note called" hint; unquote a link → the quotes hint; delete `Practice laser.md` at stage 3 with progress from stage 3 → `missingCreated` returns `['Practice laser']`.

- [ ] **Step 5: Commit** `git add src/core/guide.js && git commit -m "Guide: practice steps, checks and hints"`

### Task 2: Active map — real or practice

**Files:**
- Create: `src/plugin/practice.js`, `src/plugin/local.js`
- Modify: `src/plugin/main.js`, `src/plugin/view.js`, `src/plugin/layout-store.js`, `src/plugin/setup.js`, `esbuild.config.mjs` (only if the `.md` loader needs `templates/` subpaths; it shouldn't)

**Interfaces:**
- Consumes: `PRACTICE_DIR`, `PRACTICE_CONFIG_PATH`, `practiceConfig` (Task 1).
- Produces:
  - `local.js`: `loadLocal(app, key) -> any|null`, `saveLocal(app, key, value)` — `app.loadLocalStorage`/`saveLocalStorage` when present, else `window.localStorage` under `experiment-map:<app.appId>:<key>` (JSON).
  - `plugin.activeMap: 'real'|'practice'` (from `loadLocal(app, 'activeMap')`, default `'real'`), `plugin.configPath() -> string`, `plugin.hasPractice: boolean` (refreshed in every `loadGraph`), `async plugin.showMap(which)`.
  - `LayoutStore.flush() -> Promise` (if a save is scheduled, run it now), `LayoutStore.discard()` (cancel the timer, clear `pending`, `loaded = false`).
  - `practice.js`: `async resetPractice(plugin)` — `adapter.rmdir(PRACTICE_DIR, true)` if it exists (removes dot folders too), then write `Config.md` from `practiceConfig(configTemplate)` and create `Components/`, `Models/`; `plugin.layout.discard()` if its path is in the practice folder.

- [ ] **Step 1: `local.js` and active map in `main.js`.** Replace every `this.settings.configPath` use in `loadGraph` and `sync` with `this.configPath()`. In `loadGraph`, set `this.hasPractice = await adapter.exists(PRACTICE_CONFIG_PATH)`; if the active map is practice and its config is missing, switch `activeMap` to `'real'` (saved) and load that instead. `showMap(which)`: no-op if unchanged except opening the map; else `await this.layout.flush()`, set and save `activeMap`, call `view.resetForMap()` on each map view, `refreshViews()`, `openMap()`.

- [ ] **Step 2: `LayoutStore.flush()` and `discard()`.**

- [ ] **Step 3: View.** `isMapFile` compares with `this.plugin.configPath()` and also returns true for `PRACTICE_CONFIG_PATH` (so the switch appears when a pull brings the folder). `resetForMap()`: `fitted = false`, `selected = null`, `state.experiments = null`, `knownExperiments = []`. Toolbar: when `plugin.hasPractice`, a first group `Map` with chips `Real` and `Practice` (the active one `is-on`), calling `plugin.showMap`. When the practice map is active and the real map is missing, the `Real` chip still shows and leads to the empty state. Empty state: after **Set up**, a second button **Try the practice map** calling `plugin.startGuide()` (Task 3). The error/empty line shows "Practice map" context nowhere else.

- [ ] **Step 4: Setup notice.** `setupVault`'s notice gains ` To learn the map, run "Experiment map: Start getting started guide".` when it created something.

- [ ] **Step 5: Verify.** `npm run build` succeeds. In a scratch vault linked to the repo (the maintainer does the Obsidian checks; list them in the hand-off), and from Node: `resetPractice` cannot be run headless, so check `practiceConfig` output parses with `node cli.js --vault <scratch> --config "Experiment map practice/Config.md" check` (exit 0, no problems on an empty practice map).

- [ ] **Step 6: Commit** `git commit -am "Map view: switch between the real map and the practice map"` (add the new files).

### Task 3: Guide panel and command

**Files:**
- Create: `src/plugin/guide-view.js`
- Modify: `src/plugin/main.js`, `styles.css`

**Interfaces:**
- Consumes: Task 1 exports; `resetPractice`, `loadLocal`/`saveLocal`, `plugin.showMap`, `plugin.hasPractice` (Task 2); `loadInputs`, `buildOutputs` from `core/sync.js`.
- Produces: `GUIDE_VIEW_TYPE = 'experiment-map-guide'`, `class GuideView extends ItemView`, `plugin.startGuide()`, `plugin.openGuide()`, command `start-guide` named "Start getting started guide". Progress under local key `guide` as `{ done: string[] } | null`.

- [ ] **Step 1: `startGuide()` in `main.js` (or `practice.js`).** Flow from the spec: progress present, not finished, practice exists → modal "Continue where you left off" / "Start over"; else practice exists → modal "This will reset the practice map. Continue?" Reset / Cancel (cancel does nothing); else reset directly. Reset = `resetPractice`, progress `{ done: [] }`. Then `showMap('practice')` and `openGuide()` (reveal an existing guide leaf, else `getRightLeaf(false).setViewState({ type: GUIDE_VIEW_TYPE, active: true })` and reveal). One small `ChoiceModal(app, title, text, buttons: [{label, cta?, onClick}])` in `guide-view.js`.

- [ ] **Step 2: `GuideView`.** Icon `graduation-cap`, title "Getting started". Loads the practice graph itself (`loadInputs(plugin.io, { configPath: PRACTICE_CONFIG_PATH, offline: true })` → `buildOutputs`), refreshes debounced (300 ms) on `metadataCache` `changed` and vault `create`/`delete`/`rename` under `PRACTICE_DIR/`. On each load: `missingCreated` non-empty → only the "The practice map has changed since you started (someone may have reset it)." message and a **Start over** button (`resetPractice` + progress reset); else `advance`, save if changed, render. Missing practice config or `null` progress → "Run *Experiment map: Start getting started guide* to begin." with a **Start** button calling `startGuide()`.
  Render: header "Getting started", muted line `Practice map · step N of 6 · ` + link "show practice map" (`showMap('practice')`). Done steps one line `✓ N · title`; current step open with **Do** (each task `✓`/`☐` and its Markdown), **Why**, **Look for**, then hint boxes from `hintsFor`; later steps titles only. Markdown via `MarkdownRenderer.render(app, md, el, PRACTICE_CONFIG_PATH, this)`.
  Finished: "You've built the whole practice map." a sentence listing what it has; then: if the real map's config exists, "Your lab's map is in *<real folder>*" with a link to its `README.md` how-to note (`openLinkText`), else "Run *Experiment map: Set up this vault* to start your own map."; then "The practice map stays as a reference: use the **Practice** switch in the map's toolbar to look at it again."

- [ ] **Step 3: Styles** in `styles.css`, prefixed `em-guide-`, using Obsidian variables like the existing panel (done steps `--text-success`, later steps `--text-muted`, hint box with `--background-modifier-error`-ish border via `--color-orange`).

- [ ] **Step 4: Register** the view and command in `onload`.

- [ ] **Step 5: Verify** `npm run build` succeeds and `node -e "require('./main.js')"` is not attempted (needs Obsidian); instead grep the bundle for `experiment-map-guide`. The in-Obsidian checks go in the hand-off.

- [ ] **Step 6: Commit** `git commit -am "Getting started guide: sidebar panel and command"` (add the new file).

### Task 4: Docs and final check

**Files:**
- Modify: `docs/design.md` (new section "Getting started guide": practice folder, command flow, switch, progress storage, panel; vault layout tree; commands table), `README.md` ("Your first map" opens with the command), `templates/README.md` (a line near the top pointing to the command).

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Whole-branch review** (one fresh reviewer against the spec), fix findings.
- [ ] **Step 3: Commit** `git commit -am "Docs: getting started guide"`, then hand off with the Obsidian checklist.
