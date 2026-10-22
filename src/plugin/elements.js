import { autoPlace, applyLegacy, gridSize, snap } from '../core/layout.js';
import { isLinkType, lineStyle, wavelengthColor } from '../core/config.js';
import { asList } from '../core/wikilink.js';

export const UNPLACED = 'Unplaced';
export const groupId = location => `group:${location}`;
const groupOf = c => (c.props.location ? String(c.props.location) : UNPLACED);
const outGroupOf = c => (c.props.output_location ? String(c.props.output_location) : groupOf(c));

// A link component (a fibre) is drawn as two end markers joined by an edge.
// '#' can't appear in component names, so marker ids never clash with them.
export const markerId = (name, end) => `${name}#${end}`;
const MARKER = [14, 14]; // a marker's size (style.js)

const linkComponents = (graph, config) => Object.values(graph.components).filter(c => isLinkType(config, c.props.type));

// Keys that layout.json should keep: one per box, two per link component.
export function layoutKeys(graph, config) {
  return Object.values(graph.components).flatMap(c => (isLinkType(config, c.props.type) ? [markerId(c.name, 'in'), markerId(c.name, 'out')] : [c.name]));
}

// A link component placed before it was drawn as a link has its position under
// its plain name; that position becomes its input end's.
export function legacyLayoutKeys(graph, config) {
  return Object.fromEntries(linkComponents(graph, config).map(c => [markerId(c.name, 'in'), c.name]));
}

// Where a beam leaves a box from a port with a side in `port_sides`, as a
// Cytoscape endpoint relative to the box centre. Ports on the same side are
// spread along it in the order of their headings.
const SIDE_AXIS = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
function portEndpoints(c) {
  const sides = c.props.port_sides;
  if (!sides || typeof sides !== 'object' || Array.isArray(sides)) return {};
  const out = {};
  for (const [side, [x, y]] of Object.entries(SIDE_AXIS)) {
    const ports = c.headings.filter(h => sides[h] === side);
    ports.forEach((p, i) => {
      const along = ((i + 1) / (ports.length + 1) - 0.5) * 100;
      const pct = n => `${Math.round(n * 10) / 10}%`;
      out[p] = x ? `${pct(x * 50)} ${pct(along)}` : `${pct(along)} ${pct(y * 50)}`;
    });
  }
  return out;
}

export function toElements(graph, config, positions, flagged) {
  const comps = Object.values(graph.components);
  const link = new Set(linkComponents(graph, config).map(c => c.name));
  // A fibre's output end on the same table as its input end goes beside it.
  const nodes = comps.flatMap(c => (link.has(c.name)
    ? [
        { name: markerId(c.name, 'in'), group: groupOf(c), size: MARKER },
        { name: markerId(c.name, 'out'), group: outGroupOf(c), size: MARKER, near: outGroupOf(c) === groupOf(c) ? markerId(c.name, 'in') : undefined },
      ]
    : [{ name: c.name, group: groupOf(c) }]));
  const withLegacy = applyLegacy(positions, legacyLayoutKeys(graph, config));
  const placed = autoPlace(nodes, withLegacy);
  // Boxes never placed by hand start on the grid; saved positions stay where they are.
  const g = gridSize(config);
  for (const n of nodes) if (!withLegacy[n.name]) placed[n.name] = snap(placed[n.name], g);
  const groups = [...new Set(nodes.map(n => n.group))].sort();
  const els = groups.map(g => ({ group: 'nodes', data: { id: groupId(g), label: g, isGroup: true }, classes: 'location' }));
  for (const c of comps) {
    const typeDef = config.types[c.props.type] ?? {};
    const warn = flagged.has(c.name);
    const classes = (...extra) => [...extra, c.category ?? 'unknown', `status-${c.props.status}`, warn ? 'has-problem' : ''].filter(Boolean).join(' ');
    if (link.has(c.name)) {
      for (const [end, group] of [['in', groupOf(c)], ['out', outGroupOf(c)]]) {
        const id = markerId(c.name, end);
        const data = { id, parent: groupId(group), component: c.name, end, status: c.props.status, experiment: c.props.experiment ?? [], filterTag: c.props.filter_tag ?? '' };
        if (typeDef.color) data.color = typeDef.color;
        els.push({ group: 'nodes', data, classes: classes('marker'), position: { x: placed[id][0], y: placed[id][1] } });
      }
      const data = {
        id: `link:${c.name}`,
        source: markerId(c.name, 'in'),
        target: markerId(c.name, 'out'),
        kind: 'beam',
        component: c.name,
        color: wavelengthColor(config, asList(c.props.wavelength_nm)[0]),
        label: `${warn ? '⚠ ' : ''}${c.name}`,
      };
      if (typeDef.color) data.outline = typeDef.color;
      const style = `line-${lineStyle(config, c.props.type)}`;
      els.push({ group: 'edges', data, classes: `beam link ${style}${c.props.hide_line === true ? ' hide-line' : ''}` });
      continue;
    }
    const sub = typeDef.subtitle === false ? '' : [c.props.type ?? 'no type', c.model].filter(Boolean).join(' · ');
    const data = {
      id: c.name,
      parent: groupId(groupOf(c)),
      label: `${warn ? '⚠ ' : ''}${c.name}${sub ? `\n${sub}` : ''}`,
      type: c.props.type ?? '',
      status: c.props.status,
      experiment: c.props.experiment ?? [],
      filterTag: c.props.filter_tag ?? '',
      shape: typeDef.shape ?? 'box',
    };
    if (typeDef.color) data.color = typeDef.color;
    els.push({
      group: 'nodes',
      data,
      classes: classes(),
      position: { x: placed[c.name][0], y: placed[c.name][1] },
    });
  }
  const endpoints = Object.fromEntries(comps.map(c => [c.name, portEndpoints(c)]));
  for (const e of graph.edges) {
    const source = link.has(e.from) ? markerId(e.from, 'out') : e.from;
    const target = link.has(e.to) ? markerId(e.to, 'in') : e.to;
    const data = { id: e.id, source, target, kind: e.kind, color: e.color, label: e.label ?? '' };
    const at = e.port && !link.has(e.from) ? endpoints[e.from][e.port] : null;
    if (at) data.sourceEndpoint = at;
    els.push({ group: 'edges', data, classes: `${e.kind} line-${lineStyle(config, e.kind)}` });
  }
  return els;
}
