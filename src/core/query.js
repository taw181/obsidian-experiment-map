// Filters and one-line listings for the CLI's `find` and `channels`. Filters
// run over the same records map.yaml shows, so every resolved, inherited or
// computed property can be searched.
import { componentRecord, channelRecord } from './emit.js';
import { noteBody } from './notes.js';

const FILTER = /^([A-Za-z_][\w.-]*)(=|~)([\s\S]*)$/;

// `key=value` matches exactly, `key~text` as a substring, both ignoring case.
// A bare word is `name~word`.
export function parseFilters(args) {
  return args.map(a => {
    const m = FILTER.exec(a);
    return m ? { key: m[1], op: m[2], value: m[3] } : { key: 'name', op: '~', value: a };
  });
}

// Every scalar in a record value, as strings: lists and objects ({unit, channel})
// are flattened, so `control_from~shutterSwitch` and `rf_from="Cooling VCO"` work.
function flatValues(v) {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.flatMap(flatValues);
  if (typeof v === 'object') return Object.values(v).flatMap(flatValues);
  return [String(v)];
}

function matches(record, f) {
  const want = f.value.toLowerCase();
  return flatValues(record[f.key]).some(v => (f.op === '=' ? v.toLowerCase() === want : v.toLowerCase().includes(want)));
}

// Filter keys that no record has, so a typo says so instead of matching nothing.
function unknownKeys(records, filters) {
  return [...new Set(filters.map(f => f.key))].filter(k => !records.some(r => r[k] !== undefined));
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
// An input with an item ({unit, item}, {unit, channel}) reads `unit › item`,
// after `role: ` for a control link with a role.
const entryText = v => (v && typeof v === 'object' && !Array.isArray(v) && 'unit' in v
  ? `${v.role ? `${v.role}: ` : ''}${[v.unit ?? '(no controller)', v.item ?? v.channel].filter(Boolean).join(' › ')}`
  : flatValues(v).join(', '));
const listText = v => (Array.isArray(v) ? v.map(entryText) : [entryText(v)]).join(', ');

export function formatFind(graph, config, args) {
  const filters = parseFilters(args);
  const records = Object.values(graph.components).map(c => ({ name: c.name, ...componentRecord(c) }));
  const unknown = unknownKeys(records, filters);
  if (unknown.length) return `no component has ${unknown.map(k => `'${k}'`).join(', ')}`;
  const hits = records.filter(r => filters.every(f => matches(r, f)));
  const shown = new Set(['name', 'type', 'status', 'location', 'model', 'note']);
  const extra = [...new Set(filters.map(f => f.key))].filter(k => !shown.has(k));
  const lines = hits.map(r => {
    const parts = [`${r.name} [${r.type ?? 'no type'}, ${r.status}]`];
    if (r.location) parts.push(listText(r.location));
    if (r.model) parts.push(`model: ${r.model}`);
    for (const k of extra) parts.push(`${k}: ${listText(r[k])}`);
    if (r.note !== `${config.components_folder}/${r.name}.md`) parts.push(r.note);
    const n = graph.problems.filter(p => p.subject === r.name).length;
    if (n) parts.push(`⚠ ${plural(n, 'problem')}`);
    return parts.join('  ');
  });
  lines.push(hits.length ? plural(hits.length, 'component') : 'no components match');
  return lines.join('\n');
}

export function formatChannels(graph, args, { unused = false } = {}) {
  const filters = parseFilters(args);
  const records = [];
  for (const exp of Object.keys(graph.channels).sort()) {
    const table = graph.channels[exp];
    for (const name of Object.keys(table).sort()) {
      records.push({ experiment: exp, name, ...channelRecord(table[name]) });
    }
  }
  const unknown = unknownKeys(records, filters);
  if (unknown.length) return `no channel has ${unknown.map(k => `'${k}'`).join(', ')}`;
  const hits = records.filter(r => filters.every(f => matches(r, f)) && (!unused || !r.used_by));
  const lines = hits.map(r => {
    const parts = [r.experiment, r.name, r.address ?? `(unresolved: ${r.unresolved ?? '?'})`, r.kind];
    if (r.used_by) parts.push(`→ ${r.used_by.join(', ')}`);
    if (r.disabled) parts.push(`[${r.disabled.join(', ')}]`);
    if (r.comment) parts.push(`# ${r.comment}`);
    return parts.join('  ');
  });
  lines.push(hits.length ? plural(hits.length, 'channel') : 'no channels match');
  return lines.join('\n');
}

// The first paragraph of a note's body, on one line and cut to `max`
// characters, with how many more lines the note has. Null for an empty body.
export function noteExcerpt(text, max = 200) {
  const lines = noteBody(text).split('\n').map(l => l.trim());
  const start = lines.findIndex(l => l && !l.startsWith('#'));
  if (start < 0) return null;
  let end = start;
  while (end < lines.length && lines[end] && !lines[end].startsWith('#')) end++;
  let para = lines.slice(start, end).join(' ').replace(/\s+/g, ' ');
  if (para.length > max) para = `${para.slice(0, max).replace(/\s+\S*$/, '')}…`;
  const more = lines.slice(end).filter(Boolean).length;
  return more ? `${para} (+${plural(more, 'more line')})` : para;
}
