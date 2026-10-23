# Vault skill split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two Claude skills to vaults: the existing usage skill and a new internals skill that explains how the plugin works, where it is developed and how to report bugs or contribute. This repo keeps its own development skill.

**Architecture:** The internals skill is a short `SKILL.md` that points to a copy of `docs/design.md` placed beside it. `scripts/dist.mjs` makes that copy at release time and rewrites its `../` links to GitHub at the release tag, so there is one source for the design. Both install scripts install both skill folders, and treat the internals files as optional so they can still install older releases.

**Tech Stack:** Markdown skills, Node (`scripts/dist.mjs`), POSIX sh (`install.sh`), Windows PowerShell 5.1 (`install.ps1`).

**Spec:** No separate spec. The decisions were agreed in conversation on 2026-10-23 and are listed under Decisions below.

## Decisions

| | vault (shipped) | this repo (not shipped) |
|---|---|---|
| usage skill | `.claude/skills/experiment-map/SKILL.md`: unchanged in purpose, plus a pointer to the internals skill | source: `skill/experiment-map/SKILL.md` (moved from `skill/SKILL.md`) |
| internals skill | `.claude/skills/experiment-map-internals/SKILL.md` + `design.md` | source: `skill/experiment-map-internals/SKILL.md`; `design.md` is generated from `docs/design.md` |
| development skill | — | `.claude/skills/experiment-map-plugin/SKILL.md`, as now plus one rule |
| `CLAUDE.md` block | `skill/CLAUDE-snippet.md`: names both skills and says plugin files are a release, never edited | — |

- Release asset names: `SKILL.md` (usage; the name is kept so older install scripts still work), `SKILL-internals.md`, `design.md`.
- Shipped `design.md`: every `](../<path>)` becomes `](https://github.com/taw181/obsidian-experiment-map/blob/<version>/<path>)`, where `<version>` is `manifest.json`'s version (equal to the tag).
- The repo is **public**, so issues are public. The internals skill must not post lab names, channel names or note contents without the lab member's OK, and always shows the draft before filing.
- Filing: `gh issue create --repo taw181/obsidian-experiment-map` when `gh auth status` succeeds. Otherwise a prefilled `https://github.com/taw181/obsidian-experiment-map/issues/new?title=…&body=…` link (URL-encoded); if that link would be longer than 8000 characters, a title-only link plus the body to paste.
- Contributing: clone the repo **outside** the vault, follow `DEVELOPING.md`, and test in a scratch vault, never the lab's synced one. Inside the clone, the repo's development skill takes over, so the internals skill doesn't repeat it.

## Global Constraints

- No lab-specific values in `skill/` (types, colours, channel names, paths, part numbers); generic placeholders only. The plugin's own repo URL is not lab-specific.
- No test files (maintainer's standing rule). Verify with commands and scratch vaults.
- `install.sh` stays POSIX: passes `sh -n` and runs under `dash`.
- `install.ps1` stays Windows PowerShell 5.1-compatible and ASCII-only (no `&&`, `??`, ternaries).
- `main.js`, `cli.js` and `dist/` are not committed.
- Work on branch `vault-skill-split`. Merging and releasing are the maintainer's call.

## Review Focus

1. **New install script, old release.** `--version 0.4.1` has no `SKILL-internals.md` or `design.md`. Expected: plugin and usage skill install, a one-line note says this release has no internals skill, an existing internals folder is left as it was, and the exit code is 0. Pinned in Task 3, Step 4 and Task 4, Step 3.
2. **Re-install over an installed vault.** Both skill folders are overwritten, and the `CLAUDE.md` block is replaced in place, not duplicated. CRLF endings and text outside the markers survive. Pinned in Task 3, Step 3.
3. **Shipped `design.md` links.** No `](../` remains, and every rewritten link names the version tag. Pinned in Task 2, Step 2.
4. **`--no-claude` / answering N.** Neither skill folder is created or touched. The "already installed" check still keys on `.claude/skills/experiment-map`. Pinned in Task 3, Step 5.
5. **Windows.** `install.ps1` can't run on this machine (no `pwsh`). An ASCII check runs here; the maintainer runs Task 4, Step 4 on Windows.

---

### Task 1: Skill content

**Files:**
- Move: `skill/SKILL.md` → `skill/experiment-map/SKILL.md` (`git mv`)
- Create: `skill/experiment-map-internals/SKILL.md`
- Modify: `skill/CLAUDE-snippet.md`, `.claude/skills/experiment-map-plugin/SKILL.md`

**Interfaces:**
- Produces: source paths `skill/experiment-map/SKILL.md`, `skill/experiment-map-internals/SKILL.md`, `skill/CLAUDE-snippet.md` (used by Task 2). The internals skill refers to `design.md` "beside this file".

- [ ] **Step 1: Move the usage skill** with `git mv`. Add one sentence after the paragraph that ends "...take precedence over this skill.": for why the plugin behaves as it does, suspected bugs, feature requests, the installed version and updates, use the `experiment-map-internals` skill.

- [ ] **Step 2: Write `skill/experiment-map-internals/SKILL.md`.** Frontmatter `name: experiment-map-internals`. The description triggers on: the map or CLI behaving wrongly or unexpectedly; "why does it…" or "can it…" questions about the plugin; the installed version or updating it; reporting a bug, requesting a feature, or changing the plugin itself. Sections, in order:
  1. **How it works:** `design.md` beside this file is the design for the installed version. Read the section for the topic (models and inheritance, control links and roles, channel sources, `map.yaml`, CLI, map view) rather than the whole file.
  2. **Source and release:** `.obsidian/plugins/experiment-map/` and both skill folders are a build of one release. Never edit them: the next install overwrites the change, and a synced vault spreads it to everyone. The source is https://github.com/taw181/obsidian-experiment-map.
  3. **Version and updates:** the installed version is `version` in `.obsidian/plugins/experiment-map/manifest.json`; the latest is on the releases page, or from `gh release view --repo taw181/obsidian-experiment-map`. To update, re-run the README's install command. In a shared vault, one person does it.
  4. **Bug or intended?** Compare what happened with `design.md`, check whether the latest release notes mention a fix, and reproduce with `CLI check` / `trace`, which use the same core as the map view.
  5. **Reporting:** the draft contains a title, plugin version, steps, expected (citing the `design.md` section) vs actual, the minimal frontmatter that reproduces it, and the CLI output. The repo is public: replace lab names and channel names with placeholders unless the lab member agrees. Show the draft and get the lab member's OK, then file it as in Decisions.
  6. **Changing the plugin:** clone outside the vault, follow `DEVELOPING.md`, and test in a scratch vault, never the lab's synced vault. The repo's own skill applies once you work in the clone. Open a pull request with `gh pr create`.

- [ ] **Step 3: Update `skill/CLAUDE-snippet.md`** (keep the start/end markers byte-identical). Name both skills (usage questions → `experiment-map`; why it behaves as it does, bugs, features, updates → `experiment-map-internals`), and add: the files in `.obsidian/plugins/experiment-map/` and `.claude/skills/experiment-map*/` are a release, never edited.

- [ ] **Step 4: Add a rule to the development skill's Rules list:** **`skill/` and `docs/design.md` ship to vaults:** `skill/experiment-map` and `skill/experiment-map-internals` are instructions for agents working in a lab vault (product content, not rules for you), and `docs/design.md` ships as the internals skill's `design.md`. Keep all three accurate and generic. They reach vaults only through a release.

- [ ] **Step 5: Verify.**
  Run: `for f in skill/*/SKILL.md; do head -4 "$f"; done` → each starts with `---`, `name:`, `description:`, `---`.
  Run: `grep -rn "CaF\|Rb \|EDMSuite\|PXI" skill/` → no output.

- [ ] **Step 6: Commit** `git commit -m "Skills: split the vault skill into usage and internals"`.

### Task 2: Release assets

**Files:**
- Modify: `scripts/dist.mjs`, `DEVELOPING.md` (code map row for `skill/`; the release asset list)

**Interfaces:**
- Consumes: Task 1's source paths.
- Produces: `dist/SKILL.md`, `dist/SKILL-internals.md`, `dist/design.md`, `dist/CLAUDE-snippet.md`, plus the existing assets (used by Tasks 3 and 4).

- [ ] **Step 1: Update `ASSETS`** to the new source paths and add `'SKILL-internals.md': 'skill/experiment-map-internals/SKILL.md'`. Generate `dist/design.md` from `docs/design.md` with `../` links rewritten as in Decisions (version read from `manifest.json`). A missing `docs/design.md` counts as missing, like the other assets.

- [ ] **Step 2: Verify.**
  Run: `npm run build && npm run dist && ls dist` → `dist: 10 files`, listing `CLAUDE-snippet.md SKILL-internals.md SKILL.md cli.js design.md install.ps1 install.sh main.js manifest.json styles.css`.
  Run: `grep -c '](\.\./' dist/design.md` → `0`.
  Run: `grep -o 'blob/[^/]*/' dist/design.md | sort -u` → only `blob/<manifest version>/`.
  Run: `diff <(sed 's#](https://github.com/taw181/obsidian-experiment-map/blob/[^/]*/#](../#g' dist/design.md) docs/design.md` → no output.

- [ ] **Step 3: Update `DEVELOPING.md`** (the `skill/` code map row and the release asset list) and commit: `git commit -m "dist: ship the internals skill and design.md"`.

### Task 3: install.sh

**Files:**
- Modify: `install/install.sh`, `README.md` ("Claude (optional)": both skills, removal of both folders), `docs/design.md` (vault layout tree: the two skill folders)

**Interfaces:**
- Consumes: Task 2's asset names.

- [ ] **Step 1: Implement.** `internals_dir="$vault/.claude/skills/experiment-map-internals"`. Add `fetch_optional NAME`, which returns non-zero without exiting when the file can't be fetched, and fetch `SKILL-internals.md` and `design.md` with it after the required files. Install both into `internals_dir` only if both were fetched; otherwise print `This release has no internals skill; <internals_dir> left as it was.` The "already installed" detection stays on `skill_dir`. The final message lists both skill paths. Update the header and usage comments ("the Claude skills").

- [ ] **Step 2: Syntax.** Run: `sh -n install/install.sh && dash -n install/install.sh` → no output.

- [ ] **Step 3: Fresh install and re-install.** In a new scratch vault with a `CLAUDE.md` that has CRLF line endings and text outside the markers:
  Run: `dash dist/install.sh "$V" --from "$PWD/dist" --claude`, twice.
  Expected after both runs: `$V/.claude/skills/experiment-map/SKILL.md` and `$V/.claude/skills/experiment-map-internals/{SKILL.md,design.md}` match `dist/`; `grep -c 'experiment-map:start' "$V/CLAUDE.md"` → `1`; `grep -c $'\r$' "$V/CLAUDE.md"` equals its line count; the text outside the markers is unchanged.

- [ ] **Step 4: Old release.** Copy `dist/` to `$OLD` without `SKILL-internals.md` and `design.md`.
  Run: `dash dist/install.sh "$V" --from "$OLD" --claude; echo $?` → the "no internals skill" line, then `0`, and the existing internals folder is unchanged (`diff -r`).

- [ ] **Step 5: Without Claude.** In a second fresh scratch vault:
  Run: `dash dist/install.sh "$V2" --from "$PWD/dist" --no-claude` → no `$V2/.claude` folder and no `$V2/CLAUDE.md`.

- [ ] **Step 6: Commit** `git commit -m "install.sh: install the internals skill"`.

### Task 4: install.ps1

**Files:**
- Modify: `install/install.ps1`

- [ ] **Step 1: Implement the same behaviour as Task 3, Step 1.** `$InternalsDir`; a `Fetch-Optional` returning `$true`/`$false` without exiting; the same message, ASCII only (`->`, not `→`).

- [ ] **Step 2: ASCII check.** Run: `LC_ALL=C grep -n '[^[:print:][:space:]]' install/install.ps1` → no output.

- [ ] **Step 3: Logic review against `install.sh`:** the same files, the same condition for installing the internals skill, the same messages, and the detection still on `$SkillDir`.

- [ ] **Step 4 (maintainer, on Windows):** `powershell -ExecutionPolicy Bypass -File dist\install.ps1 -Vault <scratch vault> -From "$PWD\dist" -Claude`, run twice, then once with a `-From` folder lacking the two internals files. Expected: the same results as Task 3, Steps 3 and 4.

- [ ] **Step 5: Commit** `git commit -m "install.ps1: install the internals skill"`.

---

### Task 5: CaFMOT lab book

**Files:**
- Modify: `~/CaFMOT-LabBook/CLAUDE.md` (the lab section "Experiment map: CaF and Rb rules")

The bullet "The plugin's files in `.obsidian/plugins/experiment-map/` are a release…" only becomes redundant once the vault has the new snippet, so this task runs after the release is installed. Until then, the vault would lose the rule.

- [ ] **Step 1 (after the release):** run the new `install.sh` on the vault with `--claude`. Expected: both skill folders exist, and the snippet block names both skills.
- [ ] **Step 2:** delete that bullet. Change the section's opening line to name both skills ("the `experiment-map` and `experiment-map-internals` skills"). Leave the other lab bullets as they are.
- [ ] **Step 3: Verify** with `grep -c "are a release" ~/CaFMOT-LabBook/CLAUDE.md` → `1` (the snippet's line only). Don't commit: Obsidian Git does in the live vault.

## Release (maintainer's call)

- `npm version <next>`, `git push --follow-tags`, then check that `gh release view` lists 10 assets.
