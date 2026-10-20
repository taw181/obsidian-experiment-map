import { parseWikilink, linkList, asList } from './wikilink.js';
import { STATUSES, wavelengthColor } from './config.js';
import { normAddress, channelTables } from './channels.js';

const CONNECTIONS = ['beam_from', 'rf_from', 'control_from'];
const SIDES = ['top', 'right', 'bottom', 'left'];
const NOT_INHERITED = new Set([...CONNECTIONS, 'location', 'output_location', 'model', 'extends']);
const MERGED_LISTS = new Set(['manuals']);

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = list => [...new Set(list)].sort(cmp);

function isUnset(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

// Apply `own` on top of `base`; lists in MERGED_LISTS are concatenated instead.
function merge(base, own, source) {
  const props = { ...base.props };
  const origin = { ...base.origin };
  for (const [k, v] of Object.entries(own)) {
    if (isUnset(v)) continue;
    if (MERGED_LISTS.has(k)) {
      props[k] = [...new Set([...asList(props[k]), ...asList(v)].map(String))];
    } else {
      props[k] = v;
    }
    origin[k] = source;
  }
  return { props, origin };
}

function sortKeys(obj) {
  return Object.fromEntries(Object.keys(obj).sort(cmp).map(k => [k, obj[k]]));
}

export function buildGraph({ config, components: componentNotes, models: modelNotes, channelSources = {} }) {
  const problems = [];
  const problem = (subject, message) => problems.push({ subject, message });

  const modelMap = new Map();
  for (const n of modelNotes) {
    if (modelMap.has(n.name)) problem(n.name, `two model notes share this name (${n.path})`);
    else modelMap.set(n.name, n);
  }
  const compNotes = new Map();
  for (const n of componentNotes) {
    if (compNotes.has(n.name) || modelMap.has(n.name)) {
      problem(n.name, `another component or model note has this name (${n.path})`);
      continue;
    }
    compNotes.set(n.name, n);
  }
  for (const n of [...modelNotes, ...componentNotes]) if (n.error) problem(n.name, n.error);

  const pages = new Map(Object.entries(channelSources).map(([exp, src]) => [src.page, exp]));
  for (const src of Object.values(channelSources)) if (src.error) problem(null, `channel source '${src.experiment}': ${src.error}`);

  // --- models -------------------------------------------------------------
  const resolvedModels = new Map();
  function resolveModel(name, stack = []) {
    if (resolvedModels.has(name)) return resolvedModels.get(name);
    const note = modelMap.get(name);
    const own = { ...note.frontmatter };
    delete own.extends;
    const parentLink = parseWikilink(linkList(note.frontmatter.extends)[0]);
    let parent = null;
    let base = { props: {}, origin: {} };
    if (parentLink) {
      parent = parentLink.target;
      if (!modelMap.has(parent)) {
        problem(name, `extends [[${parent}]], which is not a model note`);
        parent = null;
      } else if (parent === name || stack.includes(parent)) {
        problem(name, `inheritance cycle: ${[...stack, name, parent].join(' → ')}`);
        parent = null;
      } else {
        base = resolveModel(parent, [...stack, name]);
      }
    } else if (!isUnset(note.frontmatter.extends)) {
      problem(name, 'extends must be a link, like "[[Generic AOM]]"');
    }
    const r = merge(base, own, `model:${name}`);
    const out = { name, path: note.path, extends: parent, props: r.props, origin: r.origin };
    resolvedModels.set(name, out);
    return out;
  }
  for (const name of [...modelMap.keys()].sort(cmp)) resolveModel(name);

  const knownExperiments = [...new Set([...config.experiments, ...Object.keys(channelSources)])].sort(cmp);

  // --- components: properties ----------------------------------------------
  const comps = new Map();
  for (const [name, note] of compNotes) {
    const fm = note.frontmatter;
    const own = {};
    for (const [k, v] of Object.entries(fm)) if (!CONNECTIONS.includes(k) && k !== 'model') own[k] = v;
    let base = { props: {}, origin: {} };
    let model = null;
    const modelLink = parseWikilink(linkList(fm.model)[0]);
    if (modelLink) {
      if (modelMap.has(modelLink.target)) {
        model = modelLink.target;
        const m = resolveModel(model);
        for (const [k, v] of Object.entries(m.props)) {
          if (NOT_INHERITED.has(k)) continue;
          base.props[k] = v;
          base.origin[k] = m.origin[k];
        }
      } else {
        problem(name, `model [[${modelLink.target}]] is not a model note`);
      }
    } else if (!isUnset(fm.model)) {
      problem(name, 'model must be a link, like "[[Example AOM model]]"');
    }
    const { props, origin } = merge(base, own, 'own');
    if (isUnset(props.status)) {
      props.status = 'active';
      origin.status = 'default';
    } else if (!STATUSES.includes(props.status)) {
      problem(name, `unknown status '${props.status}' (use ${STATUSES.join(', ')})`);
    }
    if (props.experiment !== undefined) props.experiment = asList(props.experiment).map(String).sort(cmp);
    for (const e of props.experiment ?? []) {
      if (knownExperiments.length && !knownExperiments.includes(e)) problem(name, `unknown experiment '${e}' (Config.md lists ${knownExperiments.join(', ')})`);
    }
    if (!isUnset(props.filter_tag)) {
      const tags = asList(props.filter_tag).map(String);
      props.filter_tag = tags[0];
      if (tags.length > 1) problem(name, `filter_tag takes one value, not ${tags.length}`);
      else if (!config.filter_tags.includes(tags[0])) problem(name, `unknown filter_tag '${tags[0]}' (Config.md's filter_tags lists ${config.filter_tags.join(', ') || 'none'})`);
    }
    const typeDef = props.type ? config.types[props.type] : null;
    if (!props.type) problem(name, 'no type (set type, or a model that has one)');
    else if (!typeDef) problem(name, `unknown type '${props.type}' (types are listed in Config.md)`);
    if (!isUnset(props.output_location) && !typeDef?.link) problem(name, 'output_location only applies to types with link: true in Config.md');
    if (!isUnset(props.hide_line) && !typeDef?.link) problem(name, 'hide_line only applies to types with link: true in Config.md');
    comps.set(name, {
      name, path: note.path, model, props, origin, fm,
      headings: note.headings,
      category: typeDef?.category ?? null,
      isSource: Boolean(typeDef?.source),
      inputs: { beam: [], rf: [], control: [] },
      feeds: [], drives: [],
    });
  }
  const inactive = c => c.props.status === 'spare' || c.props.status === 'retired';

  // --- controllers by board address, per experiment --------------------------
  const boardOwner = {};
  for (const c of comps.values()) {
    if (c.props.type !== 'controller' || isUnset(c.props.address)) continue;
    const addr = normAddress(c.props.address);
    for (const exp of c.props.experiment ?? []) {
      const owners = (boardOwner[exp] ??= new Map());
      if (owners.has(addr)) problem(c.name, `address ${addr} is also set on ${owners.get(addr)} (${exp})`);
      else owners.set(addr, c.name);
    }
  }

  // --- channels from the channel sources ------------------------------------
  const channels = channelTables(channelSources, boardOwner);

  // --- components: inputs --------------------------------------------------
  function linksOf(c, key) {
    const out = [];
    for (const raw of linkList(c.fm[key])) {
      const l = parseWikilink(raw);
      if (l) out.push(l);
      else problem(c.name, `${key} entry '${raw}' is not a link`);
    }
    return out;
  }
  function headingCheck(c, key, l) {
    const unit = comps.get(l.target);
    if (l.heading && !unit.headings.includes(l.heading)) problem(c.name, `${key}: [[${l.target}]] has no heading '${l.heading}'`);
  }

  for (const c of comps.values()) {
    for (const l of linksOf(c, 'beam_from')) {
      if (!comps.has(l.target)) { problem(c.name, `beam_from [[${l.target}]] is not a component note`); continue; }
      headingCheck(c, 'beam_from', l);
      c.inputs.beam.push({ unit: l.target, item: l.heading });
    }
    for (const l of linksOf(c, 'rf_from')) {
      if (!comps.has(l.target)) { problem(c.name, `rf_from [[${l.target}]] is not a component note`); continue; }
      headingCheck(c, 'rf_from', l);
      c.inputs.rf.push({ unit: l.target, item: l.heading });
    }
    for (const l of linksOf(c, 'control_from')) {
      if (pages.has(l.target)) {
        const exp = pages.get(l.target);
        const src = channelSources[exp];
        // A bare channel-page link: some channel of this experiment, not named.
        if (!l.heading) { c.inputs.control.push({ unit: null, channel: null, experiment: exp }); continue; }
        // The source itself failed (one problem says so): don't flag every channel.
        if (src.error) { c.inputs.control.push({ unit: null, channel: l.heading, experiment: exp, address: null }); continue; }
        const entry = channels[exp][l.heading];
        if (!entry) {
          problem(c.name, src.missing ? `control_from: no copy of ${src.label} yet, so channel '${l.heading}' can't be checked (run sync)` : `control_from: channel '${l.heading}' is not in ${src.label}`);
          continue;
        }
        entry.usedBy.push(c.name);
        for (const reason of entry.primary.disabled) problem(c.name, `channel '${l.heading}' is ${reason} in ${src.label}`);
        if (!entry.unit) {
          problem(c.name, entry.primary.board
            ? `channel '${l.heading}' is on board ${entry.primary.board}, but no ${exp} controller has address: ${entry.primary.board}`
            : `channel '${l.heading}' has an address the source could not resolve (${entry.primary.unresolved ?? 'none given'})`);
        }
        c.inputs.control.push({ unit: entry.unit, channel: l.heading, experiment: exp, address: entry.primary.address });
      } else if (comps.has(l.target)) {
        // A channel after # is only a label: controllers needn't list their channels.
        c.inputs.control.push({ unit: l.target, item: l.heading });
      } else {
        problem(c.name, `control_from [[${l.target}]] is not a component note or channel page`);
      }
    }
  }

  // port_sides: which side of the box each beam port (a heading) leaves from.
  for (const c of comps.values()) {
    const sides = c.props.port_sides;
    if (isUnset(sides)) continue;
    if (typeof sides !== 'object' || Array.isArray(sides)) { problem(c.name, 'port_sides must be a map of port: side, like {x: right}'); continue; }
    for (const [port, side] of Object.entries(sides)) {
      if (!c.headings.includes(port)) problem(c.name, `port_sides: no heading '${port}' in this note`);
      if (!SIDES.includes(side)) problem(c.name, `port_sides: '${side}' for ${port} is not a side (use ${SIDES.join(', ')})`);
    }
  }

  const upstreamOf = c => [...c.inputs.beam.map(b => b.unit), ...c.inputs.rf.map(r => r.unit), ...c.inputs.control.map(x => x.unit)].filter(Boolean);
  // A channel with no known controller (a bare channel-page link, or a source
  // that failed) still says which experiment it belongs to: a virtual upstream node.
  const CHANNEL_NODE = '\u0000channel:';
  const channelNodes = c => c.inputs.control.filter(x => !x.unit && x.experiment).map(x => `${CHANNEL_NODE}${x.experiment}`);

  // Inherited values: walk upstream and collect the values of the components
  // that set them (directly or via their model), stopping at each of those.
  // No partial results are cached, so loops (laser -> lock -> laser) give the
  // same answer whichever node is visited first.
  function collectUpstream(start, next, explicit) {
    const out = new Set();
    const seen = new Set([start]);
    const todo = [...next(start)];
    while (todo.length) {
      const n = todo.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      if (explicit.has(n)) for (const v of explicit.get(n)) out.add(v);
      else todo.push(...next(n));
    }
    return [...out];
  }

  // --- experiment: own, else the union of everything upstream ---------------
  const ownExperiment = new Map([...comps.values()].filter(c => c.props.experiment).map(c => [c.name, c.props.experiment]));
  for (const exp of Object.keys(channelSources)) ownExperiment.set(`${CHANNEL_NODE}${exp}`, [exp]);
  for (const c of comps.values()) {
    if (c.props.experiment) continue;
    const exps = collectUpstream(c.name, n => [...upstreamOf(comps.get(n)), ...channelNodes(comps.get(n))], ownExperiment).sort(cmp);
    if (exps.length) {
      c.props.experiment = exps;
      c.origin.experiment = 'upstream';
    } else {
      c.props.experiment = [];
      if (!inactive(c)) problem(c.name, c.isSource ? 'no experiment (sources and electronics must set experiment)' : 'no experiment, and nothing upstream to inherit one from');
    }
  }

  // --- wavelength: own, else what the beam inputs carry ----------------------
  const ownWavelength = new Map([...comps.values()]
    .filter(c => c.props.wavelength_nm !== undefined)
    .map(c => [c.name, asList(c.props.wavelength_nm).map(Number).filter(n => !Number.isNaN(n))]));
  const wavelengthsOf = name => collectUpstream(name, n => comps.get(n).inputs.beam.map(b => b.unit), ownWavelength).sort((a, b) => a - b);
  for (const c of comps.values()) {
    if (c.category !== 'optical' || c.props.wavelength_nm !== undefined) continue;
    const w = wavelengthsOf(c.name);
    if (w.length) {
      c.props.wavelength_nm = w.length === 1 ? w[0] : w;
      c.origin.wavelength_nm = 'upstream';
    }
  }

  for (const c of comps.values()) {
    const count = c.inputs.beam.length + c.inputs.rf.length + c.inputs.control.length;
    if (c.category && !c.isSource && !inactive(c) && count === 0) problem(c.name, 'has no inputs (set beam_from, rf_from or control_from)');
  }

  // --- edges and reverse links ---------------------------------------------
  const edgeMap = new Map();
  // A beam from a named port gets its own edge (and the port), so beams from
  // different ports are drawn apart; rf and control items share one edge.
  function addEdge(kind, from, to, label, color, port = null) {
    const id = port ? `${kind}:${from}#${port}->${to}` : `${kind}:${from}->${to}`;
    const e = edgeMap.get(id) ?? { id, kind, from, to, port, labels: new Set(), color };
    if (label) e.labels.add(label);
    edgeMap.set(id, e);
  }
  for (const c of comps.values()) {
    for (const b of c.inputs.beam) {
      const src = comps.get(b.unit);
      addEdge('beam', b.unit, c.name, b.item, wavelengthColor(config, asList(src.props.wavelength_nm)[0]), b.item);
      src.feeds.push(c.name);
    }
    for (const r of c.inputs.rf) {
      addEdge('rf', r.unit, c.name, r.item, config.rf_color);
      comps.get(r.unit).drives.push(c.name);
    }
    for (const x of c.inputs.control) {
      if (!x.unit) continue;
      addEdge('control', x.unit, c.name, x.channel ?? x.item, config.control_color);
      comps.get(x.unit).drives.push(c.name);
    }
  }
  const edges = [...edgeMap.values()]
    .map(e => ({ id: e.id, kind: e.kind, from: e.from, to: e.to, ...(e.port ? { port: e.port } : {}), label: [...e.labels].sort(cmp).join(', ') || null, color: e.color }))
    .sort((a, b) => cmp(a.id, b.id));

  // --- output --------------------------------------------------------------
  const components = {};
  for (const name of [...comps.keys()].sort(cmp)) {
    const c = comps.get(name);
    components[name] = {
      name, path: c.path, model: c.model, category: c.category, isSource: c.isSource, headings: c.headings,
      props: sortKeys(c.props), origin: sortKeys(c.origin), inputs: c.inputs,
      feeds: uniqSorted(c.feeds), drives: uniqSorted(c.drives),
    };
  }
  const models = {};
  for (const name of [...resolvedModels.keys()].sort(cmp)) {
    const m = resolvedModels.get(name);
    models[name] = {
      ...m, props: sortKeys(m.props), origin: sortKeys(m.origin),
      instances: Object.values(components).filter(c => c.model === name).map(c => c.name),
    };
  }
  for (const table of Object.values(channels)) for (const e of Object.values(table)) e.usedBy = uniqSorted(e.usedBy);

  const seen = new Set();
  const uniqueProblems = problems
    .filter(p => { const k = `${p.subject}\u0000${p.message}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => cmp(a.subject ?? '', b.subject ?? '') || cmp(a.message, b.message));

  const sourceMeta = Object.fromEntries(Object.entries(channelSources).map(([exp, s]) => [exp, { label: s.label, version: s.version ?? null, url: s.url ?? null }]));
  return { components, models, channels, edges, problems: uniqueProblems, sourceMeta };
}
