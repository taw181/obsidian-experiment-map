# Developing the experiment map plugin

## Build

Needs Node 18 or later.

```sh
npm install
npm run build      # main.js (plugin) and cli.js (CLI), at the repo root
npm run dev        # the same, rebuilding on every save
npm run dist       # build, then collect the release assets in dist/
```

`main.js`, `cli.js` and `dist/` are build outputs and aren't committed; the
release workflow builds them.

## Code map

| path | role |
|---|---|
| `src/core/` | Pure logic: no Obsidian, no I/O (`sync.js` takes an `io` object) |
| `core/notes.js`, `wikilink.js`, `config.js` | Frontmatter, link and `Config.md` parsing; `DEFAULT_CONFIG` |
| `core/channels.js` | Channel sources: loading a vault script, cleaning its records, grouping channels by name |
| `core/sync.js` | Reads the vault, runs the channel sources (fetch, cache, parse), writes the generated files |
| `core/graph.js` | `buildGraph()` builds `{components, models, channels[exp][name] = {primary, unit, usedBy}, edges, problems}` |
| `core/trace.js`, `emit.js`, `layout.js` | `trace` text, the generated files, `layout.json` handling and auto-placement |
| `core/query.js` | `find` / `channels` filters over the records `emit.js` writes to `map.yaml` |
| `src/plugin/` | Obsidian shell: `view.js` (Cytoscape), `elements.js`, `style.js`, `route.js` (fibre routing), `panel.js`, `commands.js`, `setup.js` |
| `src/cli/` | Node shell: `cli.js` (commands), `node-io.js` |
| `templates/` | Starter `Config.md` and how-to note, bundled into `main.js` for "Set up this vault" |
| `skill/` | The Claude skill and `CLAUDE.md` block the install scripts copy into a vault |
| `install/` | `install.sh` (POSIX sh) and `install.ps1` (Windows PowerShell 5.1+) |
| `examples/` | Example channel source |

The design is in [docs/design.md](docs/design.md). Read it before changing
behaviour, and update it when the behaviour changes.

## Rules

- **Nothing lab-specific in the code**: types, colours, channel names and paths
  belong in a vault's `Config.md` or its channel-source script.
- **Generated files are deterministic**: sorted keys, no timestamps, written
  only when their content changes. Labs sync their vaults through git, so a
  spurious change becomes a commit on every machine.
- **Keep `install.ps1` working on Windows PowerShell 5.1**, which ships with
  Windows: no `&&`, `??` or ternaries; `Invoke-WebRequest -UseBasicParsing`;
  ASCII only (5.1 reads a script without a BOM as the system code page).

## Testing in Obsidian

Use a scratch test vault, never a vault that git syncs (Obsidian Git would
commit and push your half-finished build to everyone). A test vault is any
folder opened in Obsidian with the plugin folder linked to your clone:

```sh
ln -sfn "$PWD" "/path/to/test vault/.obsidian/plugins/experiment-map"    # macOS, Linux
```

```bat
mklink /J "C:\path\to\test vault\.obsidian\plugins\experiment-map" "C:\path\to\obsidian-experiment-map"
```

Run `npm run dev`, then "Reload app without saving" in Obsidian after each change.

The CLI checks most logic without Obsidian:

```sh
node cli.js --vault "/path/to/test vault" sync --offline
node cli.js --vault "/path/to/test vault" check
node cli.js --vault "/path/to/test vault" trace --notes "Some component"
```

Test the installers against a local build with `--from`:

```sh
npm run dist
sh dist/install.sh "/path/to/test vault" --from "$PWD/dist" --claude
```

```powershell
powershell -ExecutionPolicy Bypass -File dist\install.ps1 -Vault "C:\path\to\test vault" -From "$PWD\dist" -Claude
```

## Releasing

```sh
npm version 0.3.0          # bumps package.json, manifest.json and versions.json, commits, tags 0.3.0
git push --follow-tags
```

The tag starts `.github/workflows/release.yml`, which builds and publishes a
GitHub release with `main.js`, `manifest.json`, `styles.css`, `cli.js`,
`SKILL.md`, `CLAUDE-snippet.md`, `install.sh` and `install.ps1`. The install
scripts download from the latest release. Check the release's assets once
the workflow has run (`gh release view 0.3.0`).

Don't create the release on GitHub by hand: the workflow then fails with "a
release with the same tag name already exists", leaving a latest release with
no files, which breaks every install. To recover, delete the release but keep
the tag (`gh release delete 0.3.0 --yes`), re-run the failed workflow run, then
add any notes with `gh release edit 0.3.0 --notes "..."`.
