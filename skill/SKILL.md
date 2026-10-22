---
name: experiment-map
description: Use when a question involves what feeds, drives, controls or locks a laser, beam, AOM, EOM, shutter, fibre, amplifier, destination (chamber, MOT, trap) or control channel in the lab; when troubleshooting a beam, including checking power along it against fibres' nominal input and output powers; when listing lab components (by type, location, model, wavelength) or control channels (by board, address, unused); when adding, editing or retiring notes in the experiment map; or when the map, Sync report.md or cli.js check shows a problem.
---

# Experiment map: answering and editing

The vault's experiment map describes the lab as data. Component and model notes are the source of truth; `map.yaml`, `Sync report.md` and any channel pages are generated from them and from the channel sources named in `Config.md`.

Read `Experiment map/Config.md` first (or the path in the plugin's settings): it lists the folders, the allowed `types`, the `experiments` and the `channel_sources`. The field reference is the `README.md` beside it. If this vault's `CLAUDE.md` has lab-specific rules for the experiment map, they take precedence over this skill.

All commands run from the vault root. `CLI` below means `node .obsidian/plugins/experiment-map/cli.js` (Node 18 or later).

## Answering questions about the map

Use the CLI, not `map.yaml`, the channel pages or a sweep of note files. A note holds only what was typed into it; type (from its model), experiment and wavelength (from upstream), and feeds/drives are resolved by the CLI. Each command answers in one call, one line per hit.

1. `CLI check`. If it says stale, run `CLI sync` (or `CLI sync --offline` with no network), then carry on.
2. **Chains and troubleshooting:** `CLI trace --notes "X"` (upstream) or `CLI trace --down --notes "X"`. Every component on the chain comes with type, status, location, channel name and address, its problems (⚠), the first paragraph of its note and its newest linked pages. Answer from it; open a note only when its excerpt says `(+N more lines)` and the rest looks relevant. Note paths are `<components folder>/<name>.md` unless the trace prints another.
3. **History of one component or model:** `CLI backlinks "X"` prints every lab book page linking to it (newest first, by path), each with the lines that link. Read a page only when its lines look relevant.
4. **Lists of components:** `CLI find FILTER ...`. A filter is `key=value` (exact) or `key~text` (contains), ignoring case; filters combine with AND; a bare word matches the name. Keys are anything in `map.yaml`, resolved: `find type=aom location~"laser table"`, `find wavelength_nm=780`, `find drives~cooling`, `find status=spare`.
5. **Channels** (only when `Config.md` has channel sources): `CLI channels FILTER ...` over `experiment`, `name`, `address`, `board`, `kind`, `unit`, `comment`, `disabled`, `source`, `used_by` and any extra key the source adds: `channels board=Dev1`, `channels address~port0/line3`, `channels name~shutter`, `channels experiment=<exp> --unused`. Each line gives address, kind, users (→), `[disabled reasons]` and the comment.
6. `no component has 'k'` means no component sets that key: check the spelling against `map.yaml`'s keys, not the note.

In a troubleshooting answer, list channels with address and board, flag any ⚠ on the chain, and say what the map doesn't cover.

**Power checks.** Fibres are the checkpoints. In the trace each fibre prints as `<input end> → <output end>`; then `CLI find type=fibre input_power_mW~ output_power_mW~` prints every fibre that has both nominal powers set, with their values (`key~` with nothing after it matches any set value). A fibre on the chain that this doesn't list has no powers recorded: report it as a gap, never guess a value. Give the lab member the fibres' powers in beam order so they can compare with what they measure.

## Writing component and model notes

Every value you write must come from the lab member's words or an existing note. A value you would infer (a sibling's wavelength, a part number from the name, the "obvious" channel) is not a property: leave it out and list it in your reply under **Not set, please confirm**. This holds when the person is busy or unavailable.

- **Folder and name.** Put the note in the components folder as `<unique name>.md`, or the models folder for a device kind. No tags.
- **Inputs only.** Write `beam_from`, `rf_from`, `control_from` and `<role>_control_from` as lists of quoted links: `["[[<laser>]]"]`. Outputs (`feeds`) are computed.
- **Model inheritance.** With a `model`, don't repeat its properties: type, manuals and specs come from the model. Experiment and wavelength come from upstream, except on lasers, `rf_source` and controllers, which must set `experiment` (a name from `Config.md`'s `experiments` or `channel_sources`, if it lists any).
- **VCOs and unit items.** Each VCO is its own `rf_source` note (`location` = the table of the AOM it drives, unless the lab member says otherwise; its control links split by job into `amplitude_control_from`, `frequency_control_from` and `switch_control_from`): `rf_from: ["[[<VCO>]]"]`. Only a unit with several outputs (a DDS board) uses `[[Unit#Item]]`, which needs a `## Item` heading in the unit's note. Add it if it's new.
- **Control roles.** A type with `control_roles` in `Config.md` (`rf_source`: `amplitude`, `frequency`, `switch`) takes each role's links in `<role>_control_from`, with the same link forms as `control_from`. Put a link under a role only when the lab member says which job it does; otherwise use `control_from`. `map.yaml` gives such links a `role`.
- **Control links.** `control_from: ["[[<controller>]]"]` alone is fine: a channel is optional. `["[[<controller>#<channel>]]"]` adds the channel as a label; the controller's note doesn't need a heading for it. With a channel source, `["[[<channel page>#<name>]]"]` links a named channel and the wire comes from the controller whose `address` and `experiment` match. Only write a channel the lab member names or confirms: channel names in a lab's code are labels that may be legacy, unused, reused or misleading, so never pick one because its name fits. If they aren't sure, show them candidates from the channel page (name, address, comment) to choose from, or leave the channel out. A channel-page name must exactly match a heading on that page.
- **Beam ports.** Optics that split one beam into several (one component for the whole set) get a `## <port>` heading per output; each output's component links `beam_from: ["[[<optics>#<port>]]"]`. `port_sides: {x: right, z: bottom}` on the optics note sets the side each port's beam leaves from on the map; only set it when the lab member asks for a layout. In `trace` a port shows as `beam (x)`.
- **Fibres.** `type: fibre` (or a fibre model). `location` is the input end's table and `output_location` the output end's; the map draws the fibre as a line between them; `hide_line: true` hides that line until its chain is selected (only when the lab member asks). Record `fibre_type`, `input_lens`, `output_lens`, `input_power_mW`, `output_power_mW` (nominal values) as the lab member gives them; `fibre_type` can live in a model for one part number. Measurements and re-coupling go in dated notes that link to the fibre, not in its properties. Fibre-coupled devices (fibre AOMs, amplifiers) are ordinary components; the `fibre-coupled` template adds `input_fibre`, `output_fibre`, `input_lens`, `output_lens` and the powers.
- **Replacing a device.** If a new device replaces an old one, ask before re-pointing inputs or setting the old one's `status: spare` or `retired`.

Then run `CLI sync --offline` and `CLI check`. Check must exit 0, with no new problems.

If the vault is synced by Obsidian Git, don't commit: Obsidian Git does. Never hand-edit `map.yaml`, `Sync report.md`, channel pages, `.hardware/` or `layout.json`.

## Filling in a chain or area: interview

When asked to map a whole beam, chamber, table or rack, interview the lab member. Don't draft from channel lists or from component names.

1. Ask which destinations (chambers, MOTs, traps, imaging) are being mapped, then for each: "what beams arrive here?"
2. For each beam, walk upstream one element at a time: "what is just before X?" Keep going until you reach a laser. Get each element's name, type, model or part number, and location. For a fibre, also ask where its output end is and its nominal input and output powers (and fibre type and lenses if they know them).
3. Then, for each element: what drives it (which VCO or DDS output), what switches or tunes it (in the lab member's words), and what locks it.
4. Then the electronics they named: each VCO (its own note), DDS and board, with what controls it and the board's address.

Ask one question, or a small batch, at a time. In your questions, use obviously generic placeholders, never plausible part numbers or names, which can be mistaken for a guess and confirmed. When two answers conflict, ask straight away instead of picking one. After each beam, write its notes, run sync and check, and show the trace before moving on.

## Fixing problems

| Sync report says | Fix |
|---|---|
| `… is not a component note` / `not a model note` | Fix the link spelling or create the note |
| `channel 'c' is not in <source>` | `grep -i` the channel page for similar names, report them and ask which (if any) it is. Never pick one by name, even if only one looks right. |
| `channel … is <reason> in <source>` (commented out, marked broken, …) | The hardware changed: ask what drives it now |
| `on board B, but no <exp> controller has address: B` | Add or fix a controller note with `address: B` and that `experiment` |
| `[[U]] has no heading 'h'` | Add `## h` to U's note, or fix the link |
| `no type` / `unknown type` | Set `type` or a `model` (types are listed in `Config.md`) |
| `no experiment` | Sources and electronics: set `experiment`. Others: add an input. |
| `has no inputs` | Add an input, or set `status: spare` / `retired` |
| `inheritance cycle` / `extends …` | Fix the models' `extends` links |
| `frontmatter is not valid YAML` | Quote the values that contain `[[`, `:` or `#` |
| `output_location only applies to types with link: true` | Only fibres have an output end: remove it, or fix the component's `type` |
| `hide_line only applies to types with link: true` | Only fibres have a line to hide: remove it, or fix the component's `type` |
| `unknown experiment 'X'` | Use a name listed under `experiments` or `channel_sources` in `Config.md` |
| `channel source '<exp>': …` | The channel-source script failed (named in the message): report it; don't edit the script unless asked |
| sync/check: `Config.md … nothing was written` | Fix `Config.md` (source mode, valid YAML); nothing else is wrong |
| `address the source could not resolve` | The channel source couldn't work out that channel's address: report it |
