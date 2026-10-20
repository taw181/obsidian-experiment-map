---
name: experiment-map-plugin
description: Use when changing the experiment-map Obsidian plugin or its CLI in this repo: anything under src/ (map drawing, the details panel, commands, the setup command, channel sources, sync), the generated files' format (map.yaml, channel pages, Sync report.md), templates/, skill/, the install scripts or the release workflow.
---

# Experiment map plugin: changing the code

Human docs: `DEVELOPING.md` (build, code map, test vaults, releasing) and `docs/design.md` (behaviour). Read both before changing behaviour, and update `docs/design.md` when the behaviour changes.

## Where to work

Work in this repo on a branch. Merging to `main` and releasing are the maintainer's call: ask first, and never push a tag without being asked (a tag publishes a release that every lab's install script downloads).

To try a change in Obsidian, use a scratch test vault whose `.obsidian/plugins/experiment-map` is a symlink to this repo (`ln -sfn "$PWD" "<test vault>/.obsidian/plugins/experiment-map"`). Never point a git-synced lab vault at the repo, and never open one for testing: Obsidian Git would push the half-done build to every lab member.

## Fibres (link types) and templates

- A type with `link: true` in `Config.md` (only `fibre` by default) is drawn as two end markers plus a line. The split happens **only in `elements.js`** (`toElements`, `markerId`, `layoutKeys`, `legacyLayoutKeys`): the graph, `map.yaml`, `trace`, `find` and problems still have one component per fibre. Graph edges into a fibre are re-pointed to `<name>#in`, out of it from `<name>#out`; edge ids stay the graph's, so `chainOf` highlighting works unchanged.
- In the view, markers and the `edge.link` line carry `data.component`; always map an element to its component with `componentOf()` in `view.js`, never `ele.id()` (except as the layout key in `dragfree`).
- `layout.json` keys for a fibre are `<name>#in` and `<name>#out` (`#` can't occur in names). An old plain-name entry becomes `#in` through `applyLegacy` (`core/layout.js`), applied in `toElements` and in `LayoutStore.save()`; `rename` moves `''`, `#in` and `#out`.
- `#in` goes in the `location` group, `#out` in `output_location` (falling back to `location`). `output_location` is never inherited (`NOT_INHERITED` in `graph.js`), and setting it on a non-link type is a problem. So is `hide_line`, which gives the `edge.link` the `hide-line` class; `applyVisibility` hides it unless it is `lit`.
- Every `Config.md` key needs a default in `DEFAULT_CONFIG` (`resolveConfig` drops unknown keys). `templateProperties()` in `core/config.js` picks the blank fields "New component" writes; `makeModelFrom` leaves `output_location`, `unit_properties` and blank values on the component.

## Channel sources

- The plugin knows nothing about where channels come from. `core/channels.js` loads the script named in `channel_sources` with `new Function('module', 'exports', text)`, the same in Obsidian and Node, and `cleanParse` coerces whatever it returns into the channel record. Keep the contract in `README.md` ("Control and channel sources") and `docs/design.md` in step with the code: labs write scripts against it.
- `sync.js` `loadChannelSource` never throws: a missing or failing script becomes a notice plus `error`, its channel page is left as it was, and `graph.js` reports one problem for it instead of one per channel link.
- `control_from` channels are optional: `[[Controller]]`, `[[Controller#anything]]` (no heading check) and a bare `[[<channel page>]]` are all valid.

## Rules

- **No lab-specific values in `src/`, `templates/` or `skill/`** (types, colours, channel names, paths, part numbers). Examples use obviously generic placeholders.
- **Generated files are deterministic:** sorted keys, no timestamps, written only when changed.
- **Build:** `npm run build`. `main.js`, `cli.js` and `dist/` are not committed.
- **No test files:** the maintainer's standing rule. Verify with `cli.js sync`, `check`, `trace`, `find` and `channels` on a test vault, and with throwaway `node --input-type=module -e` checks of `src/core` or `src/plugin/elements.js` and `style.js`.
- **Don't run Cytoscape headless:** a Cytoscape instance keeps Node alive, so the check hangs. Inspect the `toElements()` and `buildStyle()` output instead.
- **Install scripts:** keep `install.sh` POSIX (`sh -n`, run it under `dash`) and `install.ps1` Windows PowerShell 5.1-compatible and ASCII-only. Test with `--from dist` in a scratch vault, including a `CLAUDE.md` with CRLF line endings and text outside the markers.
- **Hand-off:** give the maintainer exactly what to check in the test vault, after "Reload app without saving".
