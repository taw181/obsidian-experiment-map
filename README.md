# Experiment map

An [Obsidian](https://obsidian.md) plugin that draws a clickable map of a lab
(lasers, beam paths, AOMs, shutters, fibres, and the electronics and control
channels that drive them) from ordinary notes in your vault. Each component
is one note; its properties say what feeds it. Click a box to see everything
upstream and downstream of it, with links to the notes that mention it.

The map works in any vault and doesn't need a terminal once installed.
Optionally, a [Claude Code](https://claude.com/claude-code) skill lets Claude
answer questions about the map ("what controls the cooling shutter?") and help
fill it in.

The plugin isn't in Obsidian's community plugin list yet; install it with the
script below.

## Install

You need Obsidian 1.5 or later, and a vault that you have opened in Obsidian
at least once.

**Windows**

1. Download [`install.ps1`](https://github.com/taw181/obsidian-experiment-map/releases/latest/download/install.ps1)
   and put it in your vault's folder.
2. Right-click it and choose **Run with PowerShell**. If Windows asks whether
   to run a file downloaded from the internet, choose **Open** or **Run once**.

   If right-click doesn't offer that, or PowerShell refuses to run scripts,
   open PowerShell and run:

   ```powershell
   cd "C:\path\to\your vault"
   powershell -ExecutionPolicy Bypass -File .\install.ps1
   ```

**macOS and Linux**

In a terminal, from your vault's folder (or any folder inside it):

```sh
curl -fsSL https://github.com/taw181/obsidian-experiment-map/releases/latest/download/install.sh | sh
```

The scripts install into the vault the current folder is in, so you can run
them from anywhere inside it, for example the root of a git-synced vault. To
install into a different vault, pass its path: `-Vault "C:\path\to\vault"` /
`sh -s -- "/path/to/vault"`.

The script asks whether to install the Claude skill too (answer **N** if you
don't use Claude). Then, in Obsidian:

1. **Settings → Community plugins**: turn off Restricted mode if asked, then
   enable **Experiment map**. If it isn't listed, press the reload button next
   to "Installed plugins", or restart Obsidian.
2. Open the command palette (Ctrl/Cmd+P) and run **Experiment map: Set up this vault**.
   It creates `Experiment map/` with a `Config.md`, `Components/`, `Models/` and a
   how-to note, and never overwrites anything.
3. Open the map with the map icon in the left ribbon.

### Updating

Run the same script again. It replaces the plugin's files and keeps your notes,
settings and layout. Then restart Obsidian.

**Shared vaults.** If your lab shares one vault through git (for example with
the Obsidian Git plugin), the plugin's files are committed like everything
else. One person runs the script and commits; everyone else gets the update on
their next pull. Lab members don't need to run the script themselves.

Script options: `-Claude` / `--claude` and `-NoClaude` / `--no-claude` answer the
Claude question in advance; `-Version 0.2.0` / `--version 0.2.0` installs a
particular release.

## Your first map

New to the map? Run **Experiment map: Start getting started guide** from the
command palette. A panel in the right sidebar walks you through building a small
practice map, step by step, in its own folder (`Experiment map practice/`) that
never touches your lab's map. It ticks each step off as you do it. Afterwards
the **Practice** switch in the map's toolbar shows it again.

Or, straight into your own map:

1. Press **+** in the map's toolbar (or run "Experiment map: New component").
   Make a laser: type `laser`, a location such as `Laser table`.
2. Select the laser's box and press **+** again: the new component is fed from
   it. Make an AOM, then a destination (`destination`, e.g. your chamber).
3. Open a note to see and edit its properties. A component only says what
   *feeds* it, as a quoted link:

   ```yaml
   type: aom
   location: Laser table
   beam_from: ["[[Example laser]]"]
   rf_from: ["[[Example AOM VCO]]"]
   control_from: ["[[DAQ board]]"]
   ```

   What it feeds is worked out. Experiment and wavelength are inherited from
   upstream.

Drag boxes to arrange them; the layout is saved in `Experiment map/layout.json`.
Locations become groups on the map.

The how-to note that "Set up this vault" writes, `Experiment map/README.md`,
has the full list of properties, and explains fibres (drawn as a line between
two tables), beam splitters with several output ports, models (shared
properties for one part number) and the problem list. `Experiment map/Config.md`
holds the settings: the component types and colours, wavelength colours,
templates and grid.

## Control and channel sources

A control link names the controller: `control_from: ["[[DAQ board]]"]`. A
channel is optional; `"[[DAQ board#line 3]]"` adds it as a label on the wire.
That is all most labs need.

If your lab's control channels are listed somewhere a script can read (a file
in your control software's repository, a CSV in the vault), a **channel
source** turns that list into a channel page per experiment. Components can then
link a channel by name, `"[[Main channels#coolingShutter]]"`. The map checks
the name exists, flags channels the source marks as disabled, and draws the
wire from the controller whose `address` matches the channel's board.

A channel source is one JavaScript file in the vault, named in `Config.md`:

```yaml
channel_sources:
  - experiment: main
    script: Experiment map/.scripts/csv-channels.js
    channel_page: Main channels
    local: true                      # re-read on every sync (a file in the vault)
    options: {file: Experiment map/channels.csv}
```

The script is plain JavaScript with no `require` or `import`, and must export
both of these functions:

- `fetch(options, {httpGetText, readText})` returns `{text, version, url, label}`:
  the raw channel list, a version string (such as a commit), a link to that
  version, and a name for messages. `httpGetText(url)` and `readText(vaultPath)`
  return text. Without `local: true`, `fetch` runs only when you press **Sync**
  online, and its text is cached in `Experiment map/.hardware/` for offline use.
- `parse(text, {options, version, url})` returns `{channels, boards, appendix}`
  straight away (it can't be `async`). Each channel is
  `{name, kind, address, unresolved, board, comment, disabled, source, extra}`:
  - `kind` is a short identifier such as `digital_out`;
  - `address` is `null` when the source can't tell, with `unresolved` saying why;
  - `disabled` is a list of reasons such as `["commented out"]`;
  - `source` is `{label, url}`;
  - `extra` holds other short values, such as `{range: "0 to 5"}`.

  `boards` (`{name, address, comment}`) and `appendix` (Markdown added to the
  end of the channel page) are optional.

[`examples/csv-channels.js`](examples/csv-channels.js) is a complete example
that reads a CSV file.

**A channel source is code that runs inside Obsidian** with the same access as
any plugin, whenever the map loads: when the vault opens, when a note changes,
and on **Sync**. Only scripts named in `Config.md` run. Treat them like any
other code you run, and review changes to them in a shared vault.

## Claude (optional)

The skill teaches [Claude Code](https://claude.com/claude-code) to:
- answer questions from the map with a small command-line tool, using its
  `trace`, `find` and `channels` commands;
- fill the map in by interviewing you, walking each beam back to its laser;
- fix the problems the map reports.

Install it by answering **y** to the script's question, or with `--claude` /
`-Claude`. It adds:

- `.claude/skills/experiment-map/SKILL.md`,
- `.obsidian/plugins/experiment-map/cli.js`, the command-line tool, which needs
  [Node.js](https://nodejs.org) 18 or later;
- a short section in the vault's `CLAUDE.md`, between
  `<!-- experiment-map:start -->` and `<!-- experiment-map:end -->`. The rest of
  the file is never changed.

Updates keep them current. To remove the skill, delete
`.claude/skills/experiment-map/` and that section.

The command-line tool also works on its own, from the vault folder:

```sh
node .obsidian/plugins/experiment-map/cli.js check
node .obsidian/plugins/experiment-map/cli.js trace --notes "Cooling shutter"
node .obsidian/plugins/experiment-map/cli.js find type=aom location~"laser table"
```

## Problems and questions

Broken links, unknown channels, components with no inputs and similar issues
show as ⚠ on the map and in `Experiment map/Sync report.md`. The plugin has
only been tested in desktop Obsidian so far.

Bug reports and questions:
[github.com/taw181/obsidian-experiment-map/issues](https://github.com/taw181/obsidian-experiment-map/issues).
Contributing: see [DEVELOPING.md](DEVELOPING.md).

MIT licence.
