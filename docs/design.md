# Experiment map: design

How the plugin and its CLI behave now. Read this before changing behaviour, and
update it in the same change. User instructions are in [README.md](../README.md);
build and release steps in [DEVELOPING.md](../DEVELOPING.md).

## Purpose

A clickable map of a lab, drawn from ordinary notes in an Obsidian vault: which
lasers feed which beams, through which modulators, shutters and fibres, and which
electronics and control channels drive them. Each component links to its note,
its manuals and the lab book pages that mention it. It serves **orientation**
(what is where, where to read more) and **troubleshooting** ("this beam is gone,
what feeds it?", by a click or by the CLI).

The map is schematic and holds the components that matter when something
breaks. It must never silently lie: anything it cannot resolve is a problem. The
code holds no lab-specific values; those come from the vault.

## Vault layout

Default paths; the folders can be changed in `Config.md`.

```
Experiment map/
  Config.md               settings
  README.md               how-to note written by "Set up this vault"
  Components/<name>.md    one note per component; names unique across components and models
  Models/<name>.md        one note per device model (a part number or a generic kind)
  Channels/<page>.md      GENERATED: one page per channel source
  map.yaml                GENERATED: full index of the map
  Sync report.md          GENERATED: list of problems
  layout.json             node positions, written by the view
  .hardware/              channel-source cache (a dot folder, hidden from Obsidian)
Experiment map practice/  the getting-started practice map: same layout, own Config.md
.obsidian/plugins/experiment-map/
  main.js manifest.json styles.css    the plugin
  cli.js                              the CLI (installed with the optional Claude skill)
```

Notes are read recursively from the two note folders. Backlinks from lab book
pages are each component's history.

## Component notes

Connection data lives in frontmatter as flat values or lists, so Obsidian's
Properties panel can edit it. The body is free text. A level-2 heading (`## x`)
names a port or item of the component.

### Types

`type` takes one value from `types` in `Config.md`. Each type may set:

| key | meaning |
|---|---|
| `category` | `optical` or `electronics`. Only optical components inherit a wavelength, and new optical notes get `beam_from`/`rf_from` |
| `source: true` | needs no inputs, and must set `experiment` itself |
| `color`, `shape: round`, `subtitle: false` | node colour; oval instead of a rounded rectangle; show only the name, without the type and model line |
| `link: true` | drawn as a two-ended connection (fibres; see Fibres) |
| `template: <name>` | template always added when a component of this type is created |

Built-in types: `laser`, `amplifier`, `aom`, `eom`, `shutter`, `fibre` (link),
`lock`, `destination` (round, no subtitle), `rf_source`, `controller` (`laser`,
`rf_source` and `controller` are sources). The starter `Config.md` adds
`beam_splitter`, `optics`, `meter` and `slm`, and gives `fibre` the `fibre` template.

### Properties

Connection properties record **inputs only**; `feeds` and `drives` are computed.

| property | meaning |
|---|---|
| `model` | link to a model note |
| `type` | from `types`; may come from the model |
| `experiment` | list. If unset, the union of the experiments upstream (beam, RF and control), stopping at each component that sets one |
| `location` | free text; each value is a group on the map. For a link type, the input end |
| `output_location` | link types only: the output end's group (default: `location`) |
| `hide_line` | link types only: `true` hides the line until its chain is selected |
| `status` | `active` (default), `spare`, `broken`, `retired` |
| `filter_tag` | one value from `filter_tags`. May come from the model; never inherited from upstream |
| `beam_from` | links to components light comes from, or to a port: `"[[Splitter#a]]"` |
| `port_sides` | map of port to `top`/`right`/`bottom`/`left`: where beams from that port leave the node |
| `rf_from` | links to RF sources, or to an item of a unit: `"[[DDS board#ch 2]]"` |
| `control_from` | links to a controller (optionally `#channel`) or a channel page; see Control links |
| `wavelength_nm` | number or list, on light sources; optical components without one inherit it along `beam_from` |
| `address` | controllers: board address, matched against channel sources' boards |
| `manuals` | list of URLs or `[label](url)` entries |
| anything else | carried into `map.yaml` and the details panel unchanged |

Links are quoted wikilinks. An unquoted `[[x]]` (which YAML reads as a nested
list) is accepted, but Obsidian doesn't treat it as a link. Blank values (`null`,
`''`, `[]`) count as unset and never override an inherited value.

```yaml
model: "[[Example AOM model]]"      # type and manuals come from the model
location: Laser table
beam_from: ["[[Example laser]]"]    # experiment and wavelength come from here
rf_from: ["[[Example AOM VCO]]"]
control_from: ["[[DAQ board#line 3]]"]
freq_shift_mhz: +80
```

### Models

A model note describes one kind of device once: shared properties in its
frontmatter, what is true of every unit in its body. Its backlinks list every unit.

1. A component inherits every model property it does not set itself.
2. A model may `extends:` one other model, to any depth; each level overrides the
   one above. A cycle is a problem, and the chain is cut at the repeat.
3. `manuals` merges instead: ancestors first, then the component's, no duplicates.
4. `beam_from`, `rf_from`, `control_from`, `location`, `output_location`, `model`
   and `extends` are never inherited.
5. Defaults (`status: active`, `experiment` and `wavelength_nm` from upstream)
   apply after inheritance, only if still unset.

### Units, items and beam ports

A unit with several outputs (a DDS board) is one note whose items are `##`
headings. `rf_from: ["[[DDS board#ch 2]]"]` draws an edge from the unit labelled
with the item; several items from one unit to one component share an edge with a
combined label.

A component with several beam outputs names its ports as headings, and
`beam_from: ["[[Splitter#a]]"]` takes light from port `a`. Unlike items, each
port gets its own beam edge (id `beam:<from>#<port>-><to>`), labelled with the
port. The splitter is still one component: tracing up from any output reaches
all inputs, and every output carries every input's wavelength. `port_sides`
fixes the side each port's beams leave from; ports on one side are spread along
it in heading order. Otherwise a beam leaves from the point facing its target.

`#heading` links in `beam_from` and `rf_from` are checked against the target's
headings; links without one always resolve.

### Fibres and link types

A `link: true` component is one component in the graph, `map.yaml` and the CLI.
Only the view draws it differently:

- two end markers (14 px circles in the type's colour): `<name>#in` in the
  `location` group, `<name>#out` in the `output_location` group. `#` cannot
  appear in a component name, so these ids never clash;
- an edge `link:<name>` between them: wavelength-coloured, outlined in the
  type's colour, curved, always labelled with the name (with `⚠` if it has
  problems), part of the beam layer;
- edges into the fibre end at `#in`; edges out of it start at `#out`.

Markers carry the fibre's status, experiment and filter tag, so filters hide them
like nodes. `trace` prints a link type's location as `<location> → <output_location>`.

### Templates and unit properties

`templates` are named lists of property names. "New component" adds the type's
template, then the one picked in the form, as blank (`null`) properties, minus
duplicates, properties the form already writes, and properties the chosen model
sets. The starter `Config.md` defines `fibre` (`output_location`, `fibre_type`,
`input_lens`, `output_lens`, `input_power_mW`, `output_power_mW`) and
`fibre-coupled` (`input_fibre`, `output_fibre`, then the same lenses and powers).
`unit_properties` (starter: the two powers) are left on the component by "Make
model from this component".

## Control links and channel sources

### Control links

`control_from` never requires a channel.

| link | meaning | wire |
|---|---|---|
| `"[[DAQ board]]"` | controlled by that component | from `DAQ board` |
| `"[[DAQ board#line 3]]"` | the same, with a label; no heading check in the controller's note | from `DAQ board`, labelled `line 3` |
| `"[[Main channels#coolingShutter]]"` | a named channel on a channel page | from the controller whose `address` matches the channel's board |
| `"[[Main channels]]"` | an unnamed channel of that experiment | none |

A bare channel-page link is not a problem, counts as an input and gives the
component that experiment (as does a named channel of a source that failed); the panel links
the page and `trace` shows `control (channel not named, <experiment>)`. A named
channel must exist in the source and not be disabled, and its board must match
the `address` of a `controller` whose `experiment` includes the source's
experiment (one address may exist in two experiments). The channel's `used_by`
gains the component.

### Channel sources

A channel source is one plain JavaScript file in the vault (no `require` or
`import`), named in `Config.md`; at most one per experiment (a second is ignored
with a notice):

```yaml
channel_sources:
  - experiment: main
    script: Experiment map/.scripts/csv-channels.js
    channel_page: Main channels      # default "<experiment> channels"
    local: true
    options: {file: Experiment map/channels.csv}
```

The plugin and CLI read the script's text and run it with
`new Function('module', 'exports', text)`. It must export both `fetch` and
`parse`; a script missing either is an error:

- `fetch(options, {httpGetText, readText})` returns `{text, version, url, label}`:
  the raw list, a short version string, a link to that version and a name for
  messages. `httpGetText(url)` and `readText(vaultPath)` return text (`readText`
  gives `null` for a missing file).
- `parse(text, {options, version, url})` returns `{channels, boards, appendix}`,
  synchronously and without I/O (a returned Promise is an error). `options` is passed through verbatim; the plugin never reads it.

A channel is `{name, kind, address, unresolved, board, comment, disabled, source, extra}`.
`name` is required (others are dropped) and may repeat. `kind` is a short
identifier (`digital_out`, shown with `_` as a space; default `channel`).
`address` has whitespace and a leading `/` removed, or is `null` with
`unresolved` giving the expression. `board` defaults to the part of `address`
before the first `/`. `disabled` is a list of reasons (`["commented out"]`; a
string is accepted), empty when usable. `source` is `{label, url}`, e.g. a file
and line. `extra` maps other short values (`{range: "0 to 5"}`). Every field is
coerced to its expected type, so a sloppy script cannot break the graph. For a
repeated name, the declaration with the fewest `disabled` reasons is the
primary (the first one on a tie).
`boards` (`[{name, address, comment}]`) and `appendix` (Markdown for the end of
the channel page) are optional. [`examples/csv-channels.js`](../examples/csv-channels.js)
is a complete example that reads a CSV in the vault.

A channel source is vault code running with the plugin's permissions, on
every load of the map (vault open, note changes, Sync). Only scripts named in
`Config.md` run.

### Fetching and caching

| source | `fetch` runs | cache |
|---|---|---|
| default | only on an online sync (Sync in the plugin, CLI `sync` without `--offline`) | text in `<output_folder>/.hardware/<experiment>.txt`, `{version, url, label}` in `<experiment>.txt.json` |
| `local: true` | on every load: view refresh, offline sync, `check`, every CLI command | none; never stale |

Everything else parses the cache. When a fetch returns the cached text, the
cache keeps its first version and URL, so generated files change only when the
list does.

### Errors and channel pages

- **Fetch fails:** for a default source, a notice ("could not fetch channels for 'x' (...); using the last copy", or "..., and there is no earlier copy"), and the cache is used. For a `local: true` source, which has no cache, it is the script's error (below).
- **No cache yet:** notice ("run sync while online"); the page says nothing has
  been fetched; each named link to it is a problem saying it can't be checked.
- **Script missing, fails to load, or throws in `parse`:** a notice and one
  problem naming the source. Its page is not rewritten (stale beats empty), and
  links to its channels are not flagged one by one.
- **Old `hardware:` key** without `channel_sources:`: a notice that it is now
  `channel_sources:`; no channels are read.

Sync writes `<channels_folder>/<channel_page>.md` for each source that loaded: a
"generated, do not edit" banner naming the label and version; one `## <name>` per
channel in source order, with a line per declaration (kind, address or the
unresolved expression, controller, `extra`, `⚠ <disabled reasons>`), then
comment, source link and `used by`; a Boards table with the matching controller;
the appendix.

## map.yaml

The full index for scripts and agents. Header comments say it is generated, how
to regenerate it, and give one line per source,
`# channels: <experiment> <label>@<7-char version or unknown>`. Sections:

- `components`: resolved properties (model chain and defaults applied), `note`,
  `model`, inputs (`beam_from`: a name or `{unit, item}`; `rf_from: [{unit, item}]`;
  `control_from`: `{unit, item}`, `{unit, channel, experiment, address}`, or
  `{experiment}` for a bare page link), `feeds`, `drives`;
- `models`: resolved properties, `note`, `extends`, `instances`;
- `channels`: per experiment and name, `extra` values plus `kind`, `address`,
  `unresolved`, `board`, `unit` (controller), `source`, `comment`, `disabled`,
  `also_declared_at`, `used_by`;
- `problems`: as in `Sync report.md`, `subject: message`.

Empty values are left out; keys are sorted.

## CLI

`node .obsidian/plugins/experiment-map/cli.js [--vault DIR] [--config PATH] <command>`,
with `--vault` defaulting to the current directory. Node 18+; dependencies are
bundled. It reads note files directly and resolves links by note name. Output is
plain lines, to keep reads short.

| command | does |
|---|---|
| `sync [--offline]` | run the channel sources; regenerate channel pages, `map.yaml`, `Sync report.md`; print notices, written files, problems |
| `check` | offline; print notices and problems; exit 1 if a generated file is stale |
| `trace NAME` | upstream tree (beam, RF, control): type, status, location, channel and address, problems, and the 3 newest lab book pages per component |
| `trace --down NAME` | the same, downstream |
| `trace --notes NAME` | adds each member's first body paragraph on one line, cut at 200 characters, with `(+N more lines)` |
| `find [FILTER ...]` | matching components: name, type, status, location, model, each filtered key, a non-default note path, problem count; then a count |
| `channels [FILTER ...] [--unused]` | matching channels (with `--unused`, used by nothing): experiment, name, address, kind, `→ used_by`, `[disabled]`, `# comment`; then a count |

Filters run over the `map.yaml` records: `key=value` matches exactly, `key~text`
as a substring, ignoring case; list and object values match if any scalar inside
does; a bare word is `name~word`. A key no record has is reported (`no component
has 'k'`). `trace` marks repeats `(see above)` and a control input without a
controller `(no controller found)`, and shows a note path only when it isn't
`<components_folder>/<name>.md`. Lab book pages exclude the output folder and
sort newest first by a `YYYY-MM-DD` at the start of the filename.

Exit codes: 0 success; 1 stale (`check`) or unknown component (`trace`, with
suggestions); 2 usage; 3 configuration error or crash.

## The map view

Opened from the ribbon or "Experiment map: Open" (an open view is revealed). It
loads the notes itself, offline, whenever a note in the components or models
folder or `Config.md` changes (debounced), so edits appear without a sync.
Channel data comes from the caches and `local` sources, not the generated pages.
Opening the view starts a quiet sync whose notices are shown once per session.

**Drawing.** One compound group per `location` ("Unplaced" for none), hidden
when all its members are. Nodes are coloured by type; electronics are
square-cornered and darker; `shape: round` types are ovals. A node shows its name
and a line with type and model. `broken` nodes are red; nodes with problems have
a dashed border and `⚠` before the name; `spare` and `retired` are hidden unless
"Spare/retired" is on. Beams are solid and wavelength-coloured
(`wavelength_colors`, else `default_wavelength_color`); RF edges dashed, control
edges dotted, both hidden by default. A collapsible legend shows the beam colours
actually drawn and the edge and node styles. An optional background image pans
and zooms with the map.

**Interaction.**

- **Select** a node, fibre marker or fibre line: its chain up and down is
  highlighted, edges in it are shown with labels (even on hidden layers), the
  rest dims. Click empty space to clear. **Double-click** opens the note.
- **Details panel** (right; reflows on narrow views): problems, model, properties
  (type, experiment, location, status first; `manuals`, `tags`, `aliases`,
  `cssclasses` hidden) with inherited ones greyed and labelled "from <model>",
  "(upstream)" or "(default)"; inputs as links (channels with their address);
  outputs; manuals; the 5 newest lab book pages linking here, "+ N more"; "Open note".
- **Toolbar**: layers (Beams, RF, Control); Show: a chip per experiment (from
  `channel_sources` and components), per `filter_tags` entry, and Spare/retired;
  search, which selects and centres a component (both fibre ends); `⚠ N`, a
  problem list whose subjects jump to the component or note; `+`; Sync; Fit.
- A node is hidden if its status is, if it has experiments and none is shown, or
  if its filter tag's chip is off. An edge is hidden if its layer is off (unless
  in the selected chain), if it is an unselected `hide_line` fibre, or if either
  end is hidden.
- On mobile, a one-time notice says the view is untested there.

## Editing workflow and commands

| command | does |
|---|---|
| Open | open or reveal the map |
| Sync | online sync, with notices and "updated N files, M problems" |
| Set up this vault | see below |
| New component | also the toolbar `+`; see below |
| New model | asks name, type, optional parent; writes `<models_folder>/<name>.md` with `extends`, `type`, empty `manuals` |
| Make model from this component | for the active component note; see below |
| Start getting started guide | see Getting started guide |

**New component** asks for a model ("(no model)" first), then name, location
(suggested; pre-filled from the selection), type (if the model has none),
experiment (if no model or a source-type model; blank means inherit) and template
(if any are defined). It writes `<components_folder>/<name>.md` with `model` or
`type`, `experiment`, `location`; `beam_from` (the selection, if both are optical)
and `rf_from` for optical types; `control_from`; `address` for controllers;
`manuals`; then the template properties, and opens it. Names may not contain
`\ / : # ^ [ ] | * " < > ?` or repeat a component or model.

**Make model from this component** moves every non-blank property except
`beam_from`, `rf_from`, `control_from`, `location`, `output_location`, `status`,
`experiment`, `address`, `model`, `tags`, `aliases`, `cssclasses` and
`unit_properties` into a new model, which `extends` the old model; the
component's `model` then points to it.

Connections are edited as note properties. Renaming a component note moves its
`layout.json` entries (plain, `#in`, `#out`).

**Set up this vault** creates what is missing and never overwrites: the folder of
the configured `Config.md` path, `Config.md` from `templates/Config.md`, the
default components and models folders, and `README.md` beside `Config.md` from
`templates/README.md`. It lists what it created (or says the vault is already set
up, and when it created something, points to the getting started guide),
switches the view to the real map and reloads it. **Empty state:** with no `Config.md`, the view shows
"This vault has no experiment map yet." with **Set up**, **Try the practice
map** (starts the guide) and, if a practice map exists, **Show the practice map**, and background
syncs stay silent. The `Config.md` path is a plugin setting (default
`Experiment map/Config.md`); the CLI takes `--config`.

## Getting started guide

A right-sidebar panel that teaches the map by having a new user build a fixed
practice map in six steps. Logic in `src/core/guide.js` (steps, checks, hints,
the practice `Config.md`); panel and command in `src/plugin/guide-view.js`.

**Practice map.** `Experiment map practice/` holds its own `Config.md`
(`practiceConfig()`: the starter settings with the practice folders and
`experiments: [practice]`), `Components/`, `Models/`, `layout.json` and generated
files. The real map never reads it. Every practice component name starts with
"Practice", so Obsidian's vault-wide link resolution never confuses a practice
note with a real one.

**Which map is showing.** `plugin.activeMap` (`real` or `practice`) picks the
`Config.md` that the view, **+**, the edit commands and Sync use. The toolbar
shows a **Map: Real / Practice** chip pair when the practice `Config.md` exists.
Switching saves a pending `layout.json` write first, then forgets the view's
viewport, selection and experiment chips. If the practice map is active and its
`Config.md` disappears, the view falls back to the real map.

**Per-machine state.** The active map and the guide's progress
(`{done: ["<step>.<task>"]}`) are kept in Obsidian's local storage for the vault,
never in the vault: shared vaults commit the plugin folder, `data.json` included.

**Command.** "Start getting started guide": with a run in progress on this
machine and a practice folder, asks *Continue where you left off* / *Start
over*; otherwise, if the practice folder exists, asks before resetting; with no
folder, resets straight away. Reset deletes the folder (dot folders too) and
writes a fresh `Config.md` and note folders; it then shows the practice map and
opens the panel.

**Steps and checks.** Six steps (laser to chamber; an AOM in between; VCO,
control board and PC; the chamber on its own table; a fibre across; a model from
the AOM), each with tasks checked against the practice graph. The panel loads the
practice map itself and re-checks on every change in the practice folder. Tasks
of the current step tick when their check passes and stay ticked (later steps
undo earlier states); a complete step moves on. A ticked task that created a
component whose note is now gone (someone else's reset arriving through git)
makes the panel say the practice map has changed and offer **Start over**.

**Panel.** Header and "Practice map · step N of 6 · show practice map"; done
steps one line each; the current step with **Do** (each task ticked on its
own), **Why**, **Look for** and hints; later steps by title. Hints: a near-miss
note name (the same ignoring case and runs of spaces); an expected value that is
off (a wrong `type`; a location that matches only ignoring case and spaces; no
beam input, or one besides the expected one; a model not named *Practice AOM
model*), never for a value the user hasn't changed yet; and the map's problems
for the step's components, reworded where the fix is known. "has no inputs" and
"nothing upstream" are left out when another hint or problem gives the cause. After
step 6: what was built, where the real map and its how-to note are (or how to
set one up), and how to view the practice map again.

## layout.json

```json
{
  "Example AOM": [280, 90],

  "Example fibre#in": [420, 90],

  "Example laser": [80, 80]
}
```

- Sorted keys, integer coordinates, a blank line between entries, so concurrent
  moves of different nodes merge cleanly in git. Only placed nodes appear;
  entries for components that no longer exist are dropped on save.
- Link components have `<name>#in` and `<name>#out`. A plain-name entry from
  before the type was a link type is used for `#in`; the next save writes `#in`
  and drops the plain name.
- Saves run one second after a drag and merge local moves onto a fresh read, so
  pulled changes are kept. The view reloads positions when the file changes.
- A dropped node or marker snaps its centre to a `grid` (`0`: off). A dropped
  group moves by the step that puts its first node on the grid. Dragging also
  saves the auto-placed nodes in the same group where they are.
- **Auto-placement**: with nothing saved, groups go in a grid of groups.
  Otherwise a new node takes the free slot nearest the middle of its group's
  placed nodes (a fibre's output end: nearest its input end, if in the same
  group), and an unplaced group is laid out as a block in the free space nearest
  the middle of the map. A slot is free when the node clears every other node and
  growing its group doesn't create a new overlap with another group. Auto-placed
  nodes start on the grid; saved positions never move.
- **Unparseable file** (git conflict markers): entries readable line by line are
  kept (the later wins), the rest auto-placed, a notice shown, and the file is
  not rewritten until the next drag.

## Config.md keys

Frontmatter keys, with the defaults from `DEFAULT_CONFIG` in `src/core/config.js`.
Unknown keys are ignored; an empty value keeps the default. The starter file's
body explains each key for users.

| key | default | meaning |
|---|---|---|
| `components_folder` | `Experiment map/Components` | component notes |
| `models_folder` | `Experiment map/Models` | model notes |
| `channels_folder` | `Experiment map/Channels` | generated channel pages |
| `output_folder` | `Experiment map` | `map.yaml`, `Sync report.md`, `layout.json`, `.hardware/` |
| `channel_sources` | `[]` | see Channel sources |
| `experiments` | `[]` | allowed `experiment` values, plus every `channel_sources` experiment; with neither, any name is allowed |
| `types` | the ten built-in types | see Types |
| `wavelength_colors` | `{}` | beam colour by wavelength in nm, keyed as written in `wavelength_nm` |
| `default_wavelength_color` | `#999999` | beams with no or an unlisted wavelength |
| `rf_color`, `control_color` | `#b48ce6`, `#9aa4b1` | RF and control edges |
| `background` | none | `{image, scale, x, y}`; the image is found by link name |
| `grid` | `20` | snap spacing in map units (a node is 150 × 46); `0` off |
| `templates` | `{}` | named lists of blank properties for New component |
| `unit_properties` | `[]` | properties "Make model" leaves on the component |
| `filter_tags` | `[]` | allowed `filter_tag` values, one toolbar chip each |

## Problems detected

Problems never block drawing. They appear on nodes, in the view's problem list
and details panel, in `Sync report.md` and `map.yaml`, in `trace` and `find`, and
from `check`; deduplicated and sorted by subject, then message. The messages
(`src/core/graph.js`):

| area | message |
|---|---|
| notes | `two model notes share this name (<path>)`; `another component or model note has this name (<path>)` |
| | `frontmatter is not valid YAML (<reason>)`; `frontmatter is not a list of properties`; `frontmatter has no closing ---` |
| channel source | `channel source '<exp>': <error>` (no subject), the error being `channel source '<exp>' has no script`, `<script> not found`, `<script>: does not export parse(text, info)`, `<script>: fetch is not a function`, or what the script threw |
| models | `extends [[<p>]], which is not a model note`; `inheritance cycle: <a> → <b> → <a>`; `extends must be a link, like "[[Generic AOM]]"` |
| | `model [[<m>]] is not a model note`; `model must be a link, like "[[Example AOM model]]"` |
| properties | `unknown status '<s>' (use active, spare, broken, retired)` |
| | `unknown experiment '<e>' (Config.md lists <list>)` (only when known experiments exist) |
| | `filter_tag takes one value, not <n>`; `unknown filter_tag '<t>' (Config.md's filter_tags lists <list or none>)` |
| | `no type (set type, or a model that has one)`; `unknown type '<t>' (types are listed in Config.md)` |
| | `output_location only applies to types with link: true in Config.md`; the same for `hide_line` |
| | `address <a> is also set on <controller> (<exp>)` |
| links | `<key> entry '<raw>' is not a link` |
| | `beam_from [[<t>]] is not a component note`; `beam_from: [[<t>]] has no heading '<h>'`; both also for `rf_from` |
| | `control_from [[<t>]] is not a component note or channel page` |
| channels | `control_from: channel '<c>' is not in <label>`; `control_from: no copy of <label> yet, so channel '<c>' can't be checked (run sync)` |
| | `channel '<c>' is <reason> in <label>` (one per `disabled` reason) |
| | `channel '<c>' is on board <b>, but no <exp> controller has address: <b>` |
| | `channel '<c>' has an address the source could not resolve (<expression or none given>)` |
| ports | `port_sides must be a map of port: side, like {x: right}`; `port_sides: no heading '<p>' in this note`; `port_sides: '<v>' for <p> is not a side (use top, right, bottom, left)` |
| inheritance | `no experiment (sources and electronics must set experiment)` (`source: true` types); `no experiment, and nothing upstream to inherit one from` |
| inputs | `has no inputs (set beam_from, rf_from or control_from)` (typed, non-source components) |

The `experiment` and no-inputs problems skip `spare` and `retired` components.
Board and address problems are reported per use, on the component that links the
channel. Channel-source conditions that are not problems (fetch failure, no cache,
duplicate source, the old `hardware:` key) are CLI notes and Obsidian notices.

## Failure behaviour

| situation | behaviour |
|---|---|
| channel source unreachable | cached copy used; notice |
| channel source script broken | one problem and a notice; its page left as it was; the rest unaffected |
| one malformed note | drawn with its problem and empty frontmatter; the rest unaffected |
| `Config.md` missing | sync and check refuse and write nothing; the view shows the empty state; the CLI exits 3 |
| `Config.md` not valid YAML | sync and check refuse and write nothing (else every machine would publish empty pages); the view keeps its last drawing, shows the error, keeps Sync available |
| `layout.json` unparseable | recover what can be read, auto-place the rest, warn, no rewrite until a drag |
| plugin fails to load | notes, `map.yaml` and the CLI still work; only the picture is lost |

## Determinism and sync

Labs often share a vault through git, where a spurious change in a generated file
becomes a commit on every machine. Generated files (`map.yaml`, channel pages,
`Sync report.md`, the `.hardware/` cache) are byte-identical for identical inputs
on any machine: sorted keys and lists, no timestamps, versions from the source,
all text read with LF endings (so CRLF checkouts give the same output), and each
file written only when its content changes. The view writes nothing in the
background except `layout.json` after a drag or rename. Sync runs when the view
opens and on demand; between syncs the pages' "used by" lists can lag behind
note edits, and `check` reports them as stale.

## Build and tooling

Plain JavaScript (ES modules), bundled by esbuild into `main.js` (the plugin) and
`cli.js` (Node). `src/core/` has no Obsidian dependency and no direct I/O:
`sync.js` takes an `io` object (`readText`, `writeText`, `listMarkdown`,
`httpGetText`), backed by Obsidian's adapter and `requestUrl` in the plugin and by
`fs` and `fetch` in the CLI. Cytoscape.js, js-yaml and `templates/*.md` are
bundled. `isDesktopOnly` is false. See [DEVELOPING.md](../DEVELOPING.md) for the
code map, test vaults and releases.

## Out of scope

- The Obsidian community plugin list; tested mobile support.
- Drawing connections in the view; free-form annotations; measured-value history
  in notes (fibre and other notes hold nominal values).
- Built-in knowledge of any control system: channel lookup is always a vault script.
- A standalone browser view or an electronics-only map (the core stays free of
  Obsidian so these remain possible).
