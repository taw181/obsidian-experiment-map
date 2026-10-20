// The getting-started guide: six steps that build a practice map, each task
// checked against the practice map's graph (buildGraph's result). Progress is
// `{ done: ["<step>.<task>", ...] }`; a ticked task stays ticked, because later
// steps change what earlier ones built.

export const PRACTICE_DIR = 'Experiment map practice';
export const PRACTICE_CONFIG_PATH = `${PRACTICE_DIR}/Config.md`;

const LASER = 'Practice laser';
const CHAMBER = 'Practice chamber';
const AOM = 'Practice AOM';
const VCO = 'Practice VCO';
const BOARD = 'Practice control board';
const PC = 'Practice PC';
const FIBRE = 'Practice fibre';
const MODEL = 'Practice AOM model';

const comp = (g, name) => g.components[name] ?? null;
const units = (g, name, kind) => (comp(g, name)?.inputs[kind] ?? []).map(x => x.unit).filter(Boolean);
const text = v => (v === null || v === undefined ? '' : String(v).trim());
const is = (g, name, { type, location, experiment }) => {
  const c = comp(g, name);
  if (!c) return false;
  if (type && c.props.type !== type) return false;
  if (location && text(c.props.location) !== location) return false;
  if (experiment && ![].concat(c.props.experiment ?? []).map(text).includes(experiment)) return false;
  return true;
};
const fedBy = (g, name, kind, from) => units(g, name, kind).includes(from);
const onlyBeamFrom = (g, name, from) => {
  const u = units(g, name, 'beam');
  return u.length === 1 && u[0] === from;
};
const yaml = line => `\n\`\`\`yaml\n${line}\n\`\`\``;

export const STEPS = [
  {
    id: 'start',
    title: 'Laser to chamber',
    subjects: [LASER, CHAMBER],
    fields: [[LASER, 'type', 'laser'], [LASER, 'location', 'Laser table'], [CHAMBER, 'type', 'destination'], [CHAMBER, 'fed', LASER]],
    tasks: [
      {
        id: 'laser',
        creates: LASER,
        text: `In the map, press **+** and choose *(no model)*. Name it **${LASER}**, location **Laser table**, type **laser**, experiment **practice**. Its note opens; you can close it.`,
        check: g => is(g, LASER, { type: 'laser', location: 'Laser table', experiment: 'practice' }),
      },
      {
        id: 'chamber',
        creates: CHAMBER,
        text: `Click **${LASER}** on the map to select it, then press **+** again. Name it **${CHAMBER}**, type **destination**. The location is filled in from the laser; leave experiment blank.`,
        check: g => is(g, CHAMBER, { type: 'destination' }) && fedBy(g, CHAMBER, 'beam', LASER),
      },
    ],
    why: `Every box on the map is one note in \`${PRACTICE_DIR}/Components\`, and its properties say what it is and what feeds it. Because the laser was selected, **+** wrote \`beam_from: ["[[${LASER}]]"]\` into the chamber's note. A laser is a source: nothing feeds it, so it names its experiment itself, and the chamber inherits it.`,
    lookFor: 'Both boxes sit in a group called **Laser table**: groups come from `location`, there is nothing else to create. A beam runs from the laser to the chamber. Click the chamber to see its details on the right.',
  },
  {
    id: 'aom',
    title: 'Put an AOM in between',
    subjects: [AOM, CHAMBER],
    fields: [[AOM, 'type', 'aom'], [AOM, 'location', 'Laser table'], [AOM, 'fed', LASER], [CHAMBER, 'only', AOM]],
    tasks: [
      {
        id: 'aom',
        creates: AOM,
        text: `Select **${LASER}** and press **+**. Name it **${AOM}**, location **Laser table**, type **aom**.`,
        check: g => is(g, AOM, { type: 'aom', location: 'Laser table' }) && fedBy(g, AOM, 'beam', LASER),
      },
      {
        id: 'rewire',
        text: `Open **${CHAMBER}** (double-click it on the map) and change its \`beam_from\` so it reads:${yaml(`beam_from: ["[[${AOM}]]"]`)}`,
        check: g => onlyBeamFrom(g, CHAMBER, AOM),
      },
    ],
    why: "A component's note only says what *feeds* it. The chamber was fed by the laser; now it's fed by the AOM, so that's the one line that changes. Nothing on the laser or AOM needs editing: the map works out what each one feeds.",
    lookFor: 'The beam now runs laser → AOM → chamber. Click the chamber: the whole chain lights up, and the details panel lists the AOM under inputs.',
  },
  {
    id: 'controls',
    title: 'Add the controls',
    subjects: [VCO, BOARD, PC, AOM],
    fields: [
      [VCO, 'type', 'rf_source'], [VCO, 'location', 'Laser table'],
      [BOARD, 'type', 'controller'], [BOARD, 'location', 'Electronics rack'],
      [PC, 'type', 'controller'], [PC, 'location', 'Electronics rack'],
    ],
    tasks: [
      {
        id: 'vco',
        creates: VCO,
        text: `Click empty space on the map so nothing is selected, then press **+**. Name it **${VCO}**, location **Laser table**, type **rf_source**, experiment **practice**.`,
        check: g => is(g, VCO, { type: 'rf_source', location: 'Laser table', experiment: 'practice' }),
      },
      {
        id: 'vco-link',
        text: `Open **${AOM}** and set:${yaml(`rf_from: ["[[${VCO}]]"]`)}`,
        check: g => fedBy(g, AOM, 'rf', VCO),
      },
      {
        id: 'board',
        creates: BOARD,
        text: `Make **${BOARD}** the same way: location **Electronics rack**, type **controller**, experiment **practice**. Leave \`address\` blank.`,
        check: g => is(g, BOARD, { type: 'controller', location: 'Electronics rack', experiment: 'practice' }),
      },
      {
        id: 'board-link',
        text: `Open **${VCO}** and set:${yaml(`control_from: ["[[${BOARD}]]"]`)}`,
        check: g => fedBy(g, VCO, 'control', BOARD),
      },
      {
        id: 'pc',
        creates: PC,
        text: `Make **${PC}**: location **Electronics rack**, type **controller**, experiment **practice**.`,
        check: g => is(g, PC, { type: 'controller', location: 'Electronics rack', experiment: 'practice' }),
      },
      {
        id: 'pc-link',
        text: `Open **${BOARD}** and set:${yaml(`control_from: ["[[${PC}]]"]`)}`,
        check: g => fedBy(g, BOARD, 'control', PC),
      },
    ],
    why: 'There are three kinds of link, and each one is written on the thing being fed: `beam_from` for light, `rf_from` for RF, `control_from` for whatever switches or tunes it. A VCO is its own note, on the table of the AOM it drives. Electronics stay coarse: one note per PC or board.',
    lookFor: 'RF and control wires are hidden at first. Turn on **RF** and **Control** under *Layers* in the map toolbar: a dashed line from the VCO to the AOM, dotted ones from the PC to the board and from the board to the VCO. Click the chamber: the whole chain lights up, PC included.',
  },
  {
    id: 'tables',
    title: 'Move the chamber to its own table',
    subjects: [CHAMBER],
    fields: [[CHAMBER, 'location', 'Chamber table']],
    tasks: [
      {
        id: 'move',
        text: `Open **${CHAMBER}** and change its location:${yaml('location: Chamber table')}`,
        check: g => is(g, CHAMBER, { location: 'Chamber table' }),
      },
    ],
    why: 'A group is every component with the same `location`. Changing one property moved the chamber to a new table. Nothing else needed editing, because the chamber still says where its light comes from.',
    lookFor: 'A **Chamber table** group appears with the chamber in it. Drag boxes, or whole groups, to tidy the map: positions are saved in `layout.json`, and a dropped box snaps to the grid. **Fit** in the toolbar brings everything back into view.',
  },
  {
    id: 'fibre',
    title: 'Fibre the beam across',
    subjects: [FIBRE, CHAMBER],
    fields: [[FIBRE, 'type', 'fibre'], [FIBRE, 'location', 'Laser table'], [FIBRE, 'fed', AOM], [FIBRE, 'output_location', 'Chamber table'], [CHAMBER, 'only', FIBRE]],
    tasks: [
      {
        id: 'fibre',
        creates: FIBRE,
        text: `Select **${AOM}** and press **+**. Name it **${FIBRE}**, location **Laser table**, type **fibre**.`,
        check: g => is(g, FIBRE, { type: 'fibre', location: 'Laser table' }) && fedBy(g, FIBRE, 'beam', AOM),
      },
      {
        id: 'output',
        text: `In the fibre's note, fill in the blank \`output_location\`:${yaml('output_location: Chamber table')}`,
        check: g => text(comp(g, FIBRE)?.props.output_location) === 'Chamber table',
      },
      {
        id: 'rewire',
        text: `Open **${CHAMBER}** and point it at the fibre:${yaml(`beam_from: ["[[${FIBRE}]]"]`)}`,
        check: g => onlyBeamFrom(g, CHAMBER, FIBRE),
      },
    ],
    why: 'A fibre is a component like any other, but it has two ends: `location` is where light goes in and `output_location` where it comes out. New fibres get the `fibre` template, which adds `output_location` and blank fields for the lenses and powers; fill those in on real fibres.',
    lookFor: 'Instead of a box, the fibre is a dot on each table joined by a line. Drag each dot on its own. Click the line or a dot to select the fibre; double-click to open its note.',
  },
  {
    id: 'model',
    title: 'Make a model from the AOM',
    subjects: [AOM],
    fields: [[AOM, 'model', MODEL]],
    tasks: [
      {
        id: 'props',
        text: `Open **${AOM}** and add two properties that are true of every AOM of this part number:${yaml('freq_shift_mhz: 80\nmanuals: ["https://example.com/aom-manual.pdf"]')}`,
        check: g => {
          const p = comp(g, AOM)?.props;
          return Boolean(p) && text(p.freq_shift_mhz) !== '' && [].concat(p.manuals ?? []).length > 0;
        },
      },
      {
        id: 'model',
        text: `With the AOM's note open, open the command palette (Ctrl/Cmd+P) and run **Experiment map: Make model from this component**. Name the model **${MODEL}**.`,
        check: g => comp(g, AOM)?.model === MODEL && g.models[MODEL]?.props.type === 'aom',
      },
    ],
    why: 'A model note holds what every unit of one device shares: its type, specs and manuals. The AOM now links to the model and inherits from it, so a second AOM of the same part number needs only `model`, a location and its connections. Connections and `location` are never inherited.',
    lookFor: `The AOM's note now has \`model: "[[${MODEL}]]"\` in place of the moved properties. Click the AOM on the map: the details panel shows \`type\` and \`freq_shift_mhz\` greyed out, marked *from ${MODEL}*. The model's note is in \`${PRACTICE_DIR}/Models\`.`,
  },
];

const taskIds = STEPS.flatMap(s => s.tasks.map(t => `${s.id}.${t.id}`));

// Ticks every task of the current step whose check passes, moving on while a
// step is complete. Never unticks; ids no step has any more are dropped.
export function advance(progress, graph) {
  const done = new Set(progress?.done ?? []);
  for (const step of STEPS) {
    let complete = true;
    for (const t of step.tasks) {
      const id = `${step.id}.${t.id}`;
      if (done.has(id)) continue;
      if (t.check(graph)) done.add(id);
      else complete = false;
    }
    if (!complete) break;
  }
  return { done: taskIds.filter(id => done.has(id)) };
}

export const isTaskDone = (progress, step, task) => (progress?.done ?? []).includes(`${step.id}.${task.id}`);

export function currentStep(progress) {
  const i = STEPS.findIndex(s => s.tasks.some(t => !isTaskDone(progress, s, t)));
  return i === -1 ? STEPS.length : i;
}

export const isFinished = progress => currentStep(progress) === STEPS.length;

// Components a ticked task made that are gone: someone else reset the practice.
export function missingCreated(progress, graph) {
  return STEPS.flatMap(s => s.tasks.filter(t => t.creates && isTaskDone(progress, s, t) && !graph.components[t.creates]).map(t => t.creates));
}

const REWORD = [
  [/is not a link/, (s, m) => `**${s}**: ${m}. Write links with brackets and quotes, like \`"[[${LASER}]]"\`.`],
  [/is not a component note/, (s, m) => `**${s}**: ${m}. Check the spelling and capitals, or make that component first.`],
  [/^no experiment \(sources/, s => `**${s}** needs \`experiment: [practice]\`.`],
  [/^unknown experiment/, s => `**${s}**: the practice map's only experiment is \`practice\`.`],
];
const KNOCK_ON = /^has no inputs|nothing upstream/;
const loose = v => text(v).replace(/\s+/g, ' ').toLowerCase();
const beamLine = from => `\`beam_from: ["[[${from}]]"]\``;

// What is off in one of the step's expected values. Only differences the user
// has clearly made: a wrong type, a value that matches only ignoring case and
// spaces, a missing or extra beam input. A value not yet changed (the chamber's
// location before step 4) gives nothing.
function fieldHint(g, [name, key, want]) {
  const c = comp(g, name);
  if (!c) return null;
  if (key === 'type') return c.props.type && c.props.type !== want ? `**${name}** should be type **${want}**, not ${c.props.type}. Change \`type\` in its note.` : null;
  if (key === 'fed') {
    const u = units(g, name, 'beam');
    if (!u.length) return `**${name}** isn't fed by anything yet. Set ${beamLine(want)} in its note (pressing **+** with **${want}** selected writes this for you).`;
    return u.includes(want) ? null : `**${name}** should be fed by **${want}**: set ${beamLine(want)} in its note.`;
  }
  if (key === 'only') {
    const u = units(g, name, 'beam');
    return u.includes(want) && u.length > 1 ? `**${name}** should be fed only by **${want}**: remove the other links, so it reads ${beamLine(want)}.` : null;
  }
  if (key === 'model') return c.model && c.model !== want ? `The guide expects the model to be called **${want}**, but yours is **${c.model}**. Rename the model note to match.` : null;
  const have = text(c.props[key]);
  return have && have !== want && loose(have) === loose(want) ? `The guide expects \`${key}: ${want}\` on **${name}**, but it has **${have}**. Change it to match exactly.` : null;
}

// Hints for what is wrong with the step's components: a near-miss name, an
// expected value that is off, or the map's own problems in the step's words.
export function hintsFor(stepIndex, graph) {
  const step = STEPS[stepIndex];
  if (!step) return [];
  const out = [];
  const names = Object.keys(graph.components);
  for (const s of step.subjects) {
    if (!graph.components[s]) {
      const near = names.find(n => loose(n) === loose(s));
      if (near) out.push(`The guide expects a note called **${s}**, but yours is **${near}**. Rename the note to match.`);
      continue;
    }
    const fields = (step.fields ?? []).filter(f => f[0] === s).map(f => fieldHint(graph, f)).filter(Boolean);
    out.push(...fields);
    const own = graph.problems.filter(x => x.subject === s);
    // A broken or missing link also leaves the component with no inputs and
    // nothing to inherit an experiment from; say only the cause.
    const caused = fields.length > 0 || own.some(x => !KNOCK_ON.test(x.message));
    for (const p of own.filter(x => !(caused && KNOCK_ON.test(x.message)))) {
      const r = REWORD.find(([re]) => re.test(p.message));
      out.push(r ? r[1](s, p.message) : `**${s}**: ${p.message}`);
    }
  }
  return [...new Set(out)];
}

const BODY = `
# Practice map

This is the getting-started practice map, not your lab's map. Running
"Experiment map: Start getting started guide" resets it, so don't keep
anything here. The settings are the same as the starter Config.md.
`;

// The practice Config.md: the starter settings, with the practice folders and
// one experiment.
export function practiceConfig(starterText) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(starterText.replace(/\r\n/g, '\n'));
  if (!m) throw new Error('starter Config.md has no frontmatter');
  const fm = m[1]
    .replace(/^(components_folder|models_folder|channels_folder|output_folder): Experiment map(\/|$)/gm, `$1: ${PRACTICE_DIR}$2`)
    .replace(/^experiments:.*$/m, 'experiments: [practice]');
  return `---\n${fm}\n---\n${BODY}`;
}
