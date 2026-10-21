# Experiment map

A clickable map of the lab: lasers, beam paths, modulators, shutters, fibres,
and the electronics and control channels that drive them. Open it with the map
icon in the left ribbon or "Experiment map: Open".

> [!tip] New here?
> Run **Experiment map: Start getting started guide** from the command palette.
> It walks you through building a small practice map, in its own folder, and
> ticks each step off as you go.

> [!warning] Not yet tested on mobile
> The map has only been tried in desktop Obsidian. On a phone or tablet it may be
> slow or misbehave; the notes themselves are fine to read and edit anywhere.

## How it works

- Every component is a note in `Components/`. Its properties say what feeds it.
- Repeated devices (e.g. one AOM part number) get a note in `Models/`; components
  inherit from their model.
- `map.yaml` and `Sync report.md` are generated. So are the pages in
  `Channels/`, if `Config.md` names any channel sources. Don't edit them.
- `layout.json` stores where boxes have been dragged. A dropped box snaps to an
  invisible grid (`grid` in `Config.md`).

## Adding a component

Press **+** in the map toolbar (or "Experiment map: New component"). Pick a model
(or "no model"), give a name and location. If a box is selected, the new
component is fed from it. Then fill in its properties:

| property | meaning | example |
|---|---|---|
| `model` | the model note it inherits from | `"[[Example AOM model]]"` |
| `type` | if no model: one of the types in `Config.md` (laser, amplifier, aom, eom, shutter, fibre, lock, meter, slm, chamber, beam_splitter, optics, rf_source, controller) | `aom` |
| `experiment` | which experiment(s); needed only on lasers and electronics, others inherit it | `[main]` |
| `location` | table or rack; becomes a group on the map (for a fibre: its input end) | `Laser table` |
| `output_location` | fibres only: where the output end is | `Chamber table` |
| `hide_line` | fibres only: hide the fibre's line until something on its chain is selected | `true` |
| `status` | active (default), spare, broken, retired | `broken` |
| `filter_tag` | one tag from `filter_tags` in `Config.md`; its toolbar chip hides everything with that tag. Not inherited down the chain | `locking` |
| `beam_from` | what the light comes from (optionally one port of it) | `["[[Example laser]]"]` |
| `rf_from` | the VCO or other RF source, optionally one item in it | `["[[Example AOM VCO]]"]` |
| `control_from` | the controller (DAQ board, PC, driver), optionally with a channel; or a channel page | `["[[DAQ board#line 3]]"]` |
| `wavelength_nm` | on light sources (and doublers); others inherit it | `780` |
| `address` | on controllers: the board's address, used to match channels from a channel source | `Dev1` |
| `manuals` | links to manuals | `["https://..."]` |

Only say what *feeds* a component; what it feeds is worked out.

The form also offers a **template**: a set of blank properties to fill in,
listed under `templates` in `Config.md`. `fibre-coupled` adds fibre and lens
fields to any device (a fibre AOM, a fibre amplifier).

Write links in quotes, as in the examples. An unquoted `[[Example laser]]` still
works on the map, but Obsidian doesn't see it as a link, so renaming the target
note won't update it.

## Control

A control link names the controller: `control_from: ["[[DAQ board]]"]`. You can
add a channel after `#` (`"[[DAQ board#line 3]]"`); it labels the wire, and the
board's note doesn't need to list its channels. Electronics are coarse: one note
per PC, DAQ board or DDS board. Each VCO is its own `rf_source` note, with the
table it sits on (normally the one of the AOM it drives) as its `location` and
whatever tunes or switches it in `control_from`. A unit with several outputs (a
DDS board) gets one `## heading` per output, linked as `[[DDS board#output]]`.

If `Config.md` names a channel source for an experiment, its channel page lists
every channel, and a link like `[[<experiment> channels#<channel>]]` draws its
wire from whichever controller has the matching `address`.

## Fibres

A fibre is a component like any other, but the map draws it as a line between
two small dots instead of a box. `location` is the input end and
`output_location` the output end, so a fibre from the laser table to the
chamber has one dot in each group; drag each dot on its own. Click the line or
a dot to select the fibre, double-click to open its note. A long fibre that
clutters the map can have `hide_line: true`: only its two dots show until you
select something on its chain.

New fibres get the `fibre` template: `output_location`, `fibre_type`,
`input_lens`, `output_lens`, `input_power_mW`, `output_power_mW`. Record the
nominal (expected) powers there, and link notes that re-couple or measure the
fibre to it, so its history collects in its backlinks. Fibres of one part
number can share a model note that holds `fibre_type`.

## Beam splitters and ports

A set of optics that splits one beam into several is one component with a
`##` heading per output, e.g. `## x`, `## y`, `## z`. Whatever each output
feeds links to that port: `beam_from: ["[[MOT beam optics#x]]"]`. Each port
is drawn as its own beam, labelled with the port when highlighted. To choose
the side of the box a port's beam leaves from, add
`port_sides: {x: right, y: right, z: bottom}` to the optics note.

Ports are optional: a plain `[[MOT beam optics]]` link still works. The map
treats the optics as one box, so a trace up from any output reaches every
input; set `wavelength_nm` on an output's component if a port only passes some
wavelengths (a dichroic).

## Models

"Experiment map: New model" makes a model note. A model can `extends:` another
model. A component inherits every model property it doesn't set itself;
`manuals` lists are combined. Connections and `location` are never inherited.
"Make model from this component" moves a component's shared properties into a
new model.

## Problems

Broken links, unknown channels, components with no inputs and similar issues
show as ⚠ on the map and in `Sync report.md`. Press **Sync** to re-read the
channel sources.

More, including channel sources and the optional Claude skill:
https://github.com/taw181/obsidian-experiment-map
