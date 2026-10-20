import { noteName } from './notes.js';

function upNeighbours(c) {
  return [...c.inputs.beam.map(b => b.unit), ...c.inputs.rf.map(r => r.unit), ...c.inputs.control.map(x => x.unit)].filter(Boolean);
}

function downNeighbours(c) {
  return [...c.feeds, ...c.drives];
}

function reach(graph, start, next) {
  const seen = new Set([start]);
  const todo = [start];
  while (todo.length) {
    const c = graph.components[todo.pop()];
    if (!c) continue;
    for (const n of next(c)) {
      if (!seen.has(n)) {
        seen.add(n);
        todo.push(n);
      }
    }
  }
  return seen;
}

export const upstream = (graph, name) => reach(graph, name, upNeighbours);
export const downstream = (graph, name) => reach(graph, name, downNeighbours);

// Everything upstream and downstream of `name`, for highlighting in the view.
export function chainOf(graph, name) {
  const up = upstream(graph, name);
  const down = downstream(graph, name);
  const nodes = new Set([...up, ...down]);
  const edges = new Set(graph.edges
    .filter(e => (up.has(e.from) && up.has(e.to)) || (down.has(e.from) && down.has(e.to)))
    .map(e => e.id));
  return { nodes, edges };
}

function controlHow(x) {
  if (x.channel) return `control (${x.channel} @ ${x.address ?? 'unresolved address'})`;
  if (x.experiment) return `control (channel not named, ${x.experiment})`;
  return x.item ? `control (${x.item})` : 'control';
}

// Indented tree of a component's chain, for the CLI. A note path is shown only
// when it isn't `<componentsFolder>/<name>.md`; `excerpts` maps names to a line
// from the note body.
export function formatTrace(graph, name, { direction = 'up', mentions = {}, mentionLimit = 3, componentsFolder = null, excerpts = {}, linkTypes = new Set() } = {}) {
  const root = graph.components[name];
  if (!root) return null;
  const arrow = direction === 'up' ? '←' : '→';
  const lines = [];
  const seen = new Set([name]);
  const describe = c => {
    const parts = [`${c.name} [${c.props.type ?? 'no type'}, ${c.props.status}]`];
    if (c.props.location) {
      const out = linkTypes.has(c.props.type) && c.props.output_location ? ` → ${c.props.output_location}` : '';
      parts.push(`${c.props.location}${out}`);
    }
    if (c.path !== `${componentsFolder}/${c.name}.md`) parts.push(c.path);
    return parts.join('  ');
  };

  function children(c) {
    if (direction === 'up') {
      return [
        ...c.inputs.beam.map(b => ({ name: b.unit, how: b.item ? `beam (${b.item})` : 'beam' })),
        ...c.inputs.rf.map(r => ({ name: r.unit, how: r.item ? `rf (${r.item})` : 'rf' })),
        ...c.inputs.control.map(x => ({ name: x.unit, how: controlHow(x) })),
      ];
    }
    const out = [];
    for (const n of c.feeds) {
      for (const b of graph.components[n].inputs.beam) if (b.unit === c.name) out.push({ name: n, how: b.item ? `beam (${b.item})` : 'beam' });
    }
    for (const n of c.drives) {
      const d = graph.components[n];
      for (const r of d.inputs.rf) if (r.unit === c.name) out.push({ name: n, how: r.item ? `rf (${r.item})` : 'rf' });
      for (const x of d.inputs.control) if (x.unit === c.name) out.push({ name: n, how: controlHow(x) });
    }
    return out;
  }

  function details(c, prefix) {
    if (excerpts[c.name]) lines.push(`${prefix}   note: ${excerpts[c.name]}`);
    const m = mentions[c.name] ?? [];
    if (m.length) {
      const more = m.length > mentionLimit ? ` (+${m.length - mentionLimit} more)` : '';
      lines.push(`${prefix}   lab book: ${m.slice(0, mentionLimit).map(noteName).join('; ')}${more}`);
    }
    for (const p of graph.problems) if (p.subject === c.name) lines.push(`${prefix}   ⚠ ${p.message}`);
  }

  function walk(c, prefix) {
    const kids = children(c);
    kids.forEach((k, i) => {
      const last = i === kids.length - 1;
      const branch = prefix + (last ? '└─ ' : '├─ ');
      const next = prefix + (last ? '   ' : '│  ');
      if (!k.name) {
        lines.push(`${branch}${k.how} ${arrow} (no controller found)`);
        return;
      }
      const kc = graph.components[k.name];
      if (seen.has(k.name)) {
        lines.push(`${branch}${k.how} ${arrow} ${k.name} (see above)`);
        return;
      }
      seen.add(k.name);
      lines.push(`${branch}${k.how} ${arrow} ${describe(kc)}`);
      details(kc, next);
      walk(kc, next);
    });
  }

  lines.push(describe(root));
  details(root, '');
  walk(root, '');
  return lines.join('\n');
}
