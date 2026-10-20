# Getting started guide: design

An interactive guide, inside the plugin, that teaches a new user the experiment
map by having them build a small practice map step by step. The plugin watches
their notes and ticks each task off as it sees it done.

Marked *(builder's call)* or *(designer's call)* where a choice was made without the
maintainer; everything else was agreed.

## Why

Nobody new has used the map yet. The maintainer wants to build this and then
test it on a new user. The how-to note written by "Set up this vault"
(`templates/README.md`) is a reference: it lists properties but never walks
anyone through building something. What a newcomer is most likely to trip on,
from the code:

- connections are typed by hand as note properties (quoted wikilinks), and a
  note lists only what *feeds* it; there is no drawing of edges in the view;
- groups are not created anywhere, they appear from `location` values;
- fibres need two locations and are drawn as two dots and a line;
- models come from two commands and inherit silently.

## Who it's for

A lab member who knows the physical experiment (lasers, fibres, tables) but has
never used the plugin, working in the lab's **shared labbook vault** (synced
through git), where someone has usually set up the real map already. Other lab
members tell them to do the practice; they don't discover it alone.

## Goals

- A new user builds a curated practice map in six steps, each teaching one
  idea: components and groups, editing connections, RF and control links,
  locations as groups, fibres, models.
- Each step explains itself in the sidebar: what to do, why it works that way,
  and what to look for on the map afterwards.
- The plugin checks each task from the practice notes and ticks it as soon as it
  is done; when something is wrong it says what, in the step's own words.
- The finished practice map stays in the vault as a reference, viewable from the
  map view.

## Non-goals

- Anything for the real map: the guide never reads or writes the real map's
  notes, `Config.md` or `layout.json`.
- A toolbar button to start the guide (the maintainer: the README line is
  enough; teammates point new users at it).
- Channel sources, the CLI or the Claude skill in the practice *(designer's call)*.
- A general tutorial framework for other content *(designer's call)*: six fixed steps
  in code is fine.
- Mobile.

## Anti-goals (failure even if it technically works)

- The practice touches or clutters the real map, or practice notes get confused
  with real components in Obsidian links.
- A task ticks when it isn't really done, or doesn't tick when it is.
- Spurious changes in the shared vault: generated files must stay deterministic
  like the rest of the plugin, so the practice doesn't make a commit on every
  machine.
- A wall of text: each part of a step is a few sentences.

## The practice map

### Where it lives

- Its own folder, apart from `Experiment map/`: `Experiment map practice/` *(designer's call
  on the name)*, with its own `Config.md`, `Components/`, `Models/`,
  `layout.json` and generated files. The real map never reads it, because the
  map only reads its own configured folders.
- The practice `Config.md` is a bundled template (e.g.
  `templates/practice/Config.md`) with the starter types and
  `experiments: [practice]` *(designer's call)*. Its body says it is the practice map
  and that the guide resets it. Other keys: *(builder's call)*.
- Every practice component name starts with "Practice", so Obsidian never
  confuses a practice note with a real one of the same name (it resolves links
  by name across the whole vault, and lab book mentions use that resolution).

### Starting fresh

Starting the guide resets the practice folder for the new person: the previous
person's practice notes, models and layout are removed and the practice
`Config.md` rewritten from the template. Every run ends in the same state, so
nothing is lost, and the folder being committed and shared is fine. Anyone who
wants to stay out of the shared vault can do the practice in a fresh vault.

What the command does *(designer's call)*:

- **Run in progress on this machine** (stored progress, not finished): ask
  "Continue where you left off" or "Start over". Continue reopens the panel at
  the stored step without touching the folder; Start over resets.
- **Otherwise, practice folder has content** (someone else's run, or this
  machine's finished one): ask "This will reset the practice map. Continue?";
  No cancels and changes nothing.
- **No practice folder yet**: reset without asking.

Obsidian restores an open sidebar panel on restart by itself; the command is
how to get it back after closing it.

**Someone else's run arriving through git** *(designer's call)*: progress stays per
machine and no run marker goes into the shared folder. Instead, whenever the
panel loads it checks that every component a finished step created still
exists in the practice folder. If one is missing (another person reset the
practice and the pull brought it in), the panel shows "The practice map has
changed since you started (someone may have reset it)" with a **Start over**
button, and ticks nothing until then. Two people practising in the same shared
vault in the same week can still collide; that is accepted, and the fresh-vault
option is the way out.

### Viewing it afterwards

The map view gets a **Practice / Real** switch in its toolbar *(designer's call on its
form)*, shown only when the practice folder exists. While the practice map is
showing, the map view, **+**, "New component", "New model" and "Make model from
this component" all act on the practice map (its folders and config); they must
not write into the real map, and vice versa. The guide panel's header also has
a "show practice map" link. Starting the guide switches the view to the
practice map.

The guide works whether or not the vault's real map has been set up.

## The six steps

Names, locations and values are the guide's; the user types them exactly as
shown. Placeholder names (agreed as placeholders, wording *(builder's call)*):
locations `Laser table`, `Chamber table`, `Electronics rack`.

| step | the user does | teaches |
|---|---|---|
| 1. Laser to chamber | **+** → *Practice laser*, type `laser`, location *Laser table*, experiment *practice*. Select it, **+** → *Practice chamber*, type `destination` (location pre-filled) | one note per box; `location` makes a group; the chamber's `beam_from` points at the laser (written by **+** from the selection) |
| 2. Put an AOM in between | select the laser, **+** → *Practice AOM*, type `aom`, *Laser table*. Open the chamber, set `beam_from: ["[[Practice AOM]]"]` | connections are note properties; a note lists only what feeds it; quoted links |
| 3. Add the controls | *Practice VCO* (`rf_source`, *Laser table*, experiment *practice*); AOM gets `rf_from: ["[[Practice VCO]]"]`. *Practice control board* (`controller`, *Electronics rack*, *practice*); VCO gets `control_from: ["[[Practice control board]]"]`. *Practice PC* (`controller`, *Electronics rack*, *practice*); board gets `control_from: ["[[Practice PC]]"]`. Turn on the RF and Control layers | electronics; the three kinds of link; layers |
| 4. Move the chamber to its own table | set the chamber's `location` to *Chamber table*; drag things tidy | groups are just locations; dragging; the saved layout |
| 5. Fibre the beam across | select the AOM, **+** → *Practice fibre*, type `fibre`, *Laser table*; set `output_location: Chamber table` (blank, from the fibre template); chamber gets `beam_from: ["[[Practice fibre]]"]` | link types: two dots, one per group, and a line |
| 6. Make a model from the AOM | add a part-number property and a manual to the AOM (e.g. `freq_shift_mhz: 80` and a placeholder manual link) *(designer's call: without them only `type` would move)*; with the AOM's note open, run "Make model from this component", name it *Practice AOM model* | models hold what every unit shares; inherited values show greyed "from <model>" in the details panel |

Rough picture of the map after each step (from the brainstorm mockup):

```
1  [Laser table: Laser ──► Chamber]
2  [Laser table: Laser ──► AOM ──► Chamber]
3  [Laser table: Laser ──► AOM ──► Chamber ; VCO ┄rf┄► AOM]
   [Electronics rack: PC ┈ctl┈► Control board] ┈ctl┈► VCO
4  as 3, with Chamber in its own [Chamber table] group
5  AOM ──► ●fibre in (Laser table) ═══ ●fibre out (Chamber table) ──► Chamber
6  as 5; AOM's type and the added properties now come from Practice AOM model
```

### Checks

Each "Do" line is one task with its own check, evaluated against the practice
map's graph (the same `buildGraph` result the view draws). The view already
reloads on every note change, so ticks follow edits with the usual debounce.
Examples: "a component *Practice AOM* of type `aom` with `beam_from` *Practice
laser*"; "*Practice chamber*'s only `beam_from` is *Practice AOM*"; "*Practice
fibre* has `location` *Laser table* and `output_location` *Chamber table*";
"*Practice AOM*'s `model` is a model note whose `type` is `aom`".

- Later steps change what earlier ones built (step 2 re-points the chamber away
  from the laser), so a finished step stays done: progress is stored, not
  re-derived from the current notes. Where it is stored is *(builder's call)*;
  storing it per machine (the plugin's data) rather than in the shared folder
  avoids fighting between machines.
- Matching rules (exact names, how forgiving about case or extra whitespace,
  whether a task can tick out of order) are *(builder's call)*, within the anti-goal:
  never tick something not really done, never miss something that is.
- Layer toggles in step 3 are "Look for", not a checked task *(designer's call)*.

## The sidebar panel

A view in Obsidian's right sidebar (like Outline or Backlinks), so it stays
visible while the user switches between the map and component notes. Agreed
from a mockup of step 2:

- Header: "Getting started", "Practice map · step N of 6", and the "show
  practice map" link.
- Finished steps fold to one line with a tick. Later steps show only their
  titles. The current step is open, in three parts:
  - **Do**: the tasks, each ticked on its own as the plugin sees it done, with
    exact values; when a property must be typed, the line as it should end up
    (`beam_from: ["[[Practice AOM]]"]`).
  - **Why**: a few sentences on why it works this way.
  - **Look for**: what to notice on the map now.
- A hint box appears only when something the user did is wrong: the map's own
  problem messages for the practice components, reworded for the step (e.g. the
  chamber's `beam_from` isn't a link: "put the quotes around it"). Which
  conditions get custom wording is *(builder's call)*; fall back to the map's
  message.
- Draft copy from the mockup, for step 2: *Why* — "A component's note only says
  what feeds it. The chamber was fed by the laser; now it's fed by the AOM, so
  that's the one line that changes. Nothing on the laser or AOM needs editing:
  the map works out what each one feeds." *Look for* — "The beam now runs laser
  → AOM → chamber. Click the chamber: the whole chain lights up, and the details
  panel lists the AOM under inputs." Final wording for all steps is the
  builder's, to be read by the maintainer.

### Finishing

After step 6 the panel shows a short "you're done" message: what they built,
that their real map is `Experiment map/` (or how to set one up if the vault has
none), a link to the how-to note, and how to get back to the practice map (the
Practice / Real switch).

## How a new user gets in

- A command, **Experiment map: Start getting started guide**, runnable any
  time; it continues or resets as above, opens the panel and shows the
  practice map.
- A line near the top of the how-to note (`templates/README.md`) and the
  plugin's `README.md` pointing to the command.
- For a vault with no map yet: a "Try the practice map" button next to **Set
  up** in the empty map view, and a line in the notice "Set up this vault"
  shows.

No toolbar button for the guide.

## Constraints

- Built into this plugin: plain JavaScript ES modules, bundled by esbuild, as
  the rest of `src/plugin/` *(designer's call; it's the existing codebase)*. Practice
  templates bundled like `templates/*.md`.
- The repo's rules apply: nothing lab-specific in `src/` or `templates/`;
  generated files deterministic; no test files (verify with the CLI pointed at
  the practice folder's `Config.md` via `--config`, and in a scratch test vault).
- Update `docs/design.md`, `README.md` and `templates/README.md` with the
  behaviour.
- The plugin today holds one map's state (`plugin.config`, `graph`, `layout`,
  set from `settings.configPath`). Showing the practice map means that state is
  per map; how to restructure it is the builder's, as long as commands act on
  the map that is showing.

## Success

A new lab member, told only "do the practice in the experiment map", completes
all six steps from the sidebar without help, and can then make a component in
the real map. The maintainer will test this with a real new user.

## Left to the builder

Everything marked *(builder's call)*, plus: the panel's styling (following
Obsidian's theme like the rest of the plugin), the switch's exact form, how
reset deletes files, step copy, and how ticks animate, if at all.
