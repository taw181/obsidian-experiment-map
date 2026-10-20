// layout.json: { "component name": [x, y], ... }, sorted, one entry per line with
// a blank line between entries, so git merges moves of different boxes cleanly.

const ENTRY = /^\s*("(?:[^"\\]|\\.)*")\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/;

// Entries that can still be read line by line from a broken file, e.g. one left
// with git conflict markers. Where a name appears twice, the later line wins.
function salvage(text) {
  const positions = {};
  for (const line of text.split(/\r?\n/)) {
    const m = ENTRY.exec(line);
    if (!m) continue;
    try {
      positions[JSON.parse(m[1])] = [Number(m[2]), Number(m[3])];
    } catch {
      // not a valid JSON string; skip the line
    }
  }
  return positions;
}

export function parseLayout(text) {
  if (text === null || text === undefined || text.trim() === '') return { ok: true, positions: {} };
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, positions: salvage(text) };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, positions: {} };
  const positions = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite)) positions[k] = [v[0], v[1]];
  }
  return { ok: true, positions };
}

// `legacy` maps a new key to the old key its position used to be saved under
// (a fibre's input end to the fibre's name). The old position is carried over
// only when the new key has none.
export function applyLegacy(positions, legacy) {
  const out = { ...positions };
  for (const [newKey, oldKey] of Object.entries(legacy ?? {})) {
    if (!out[newKey] && out[oldKey]) out[newKey] = out[oldKey];
  }
  return out;
}

export function serializeLayout(positions, keep = null) {
  const names = Object.keys(positions).filter(n => !keep || keep.has(n)).sort();
  if (!names.length) return '{}\n';
  const rows = names.map(n => `  ${JSON.stringify(n)}: [${Math.round(positions[n][0])}, ${Math.round(positions[n][1])}]`);
  return `{\n${rows.join(',\n\n')}\n}\n`;
}

// Grid spacing in map units from `Config.md` `grid`; 0 (or anything not a
// positive number) turns snapping off.
export function gridSize(config) {
  const g = Number(config?.grid);
  return Number.isFinite(g) && g > 0 ? g : 0;
}

export const snap = (xy, g) => (g ? [Math.round(xy[0] / g) * g, Math.round(xy[1] / g) * g] : xy);

const COLS = 4;
const DX = 180;
const DY = 90;
const GROUP_COLS = 3;
const GROUP_DX = 800;
const GROUP_DY = 500;
const GROUP_GAP = 140;

const BOX = [150, 46];
const GROUP_PAD = 28; // a location group's padding (style.js)
const GAP = 20; // clear space kept between boxes, and between groups
const SEARCH = 15; // slots tried in each direction from the anchor
const OFFSETS = [];
for (let j = -SEARCH; j <= SEARCH; j++) for (let i = -SEARCH; i <= SEARCH; i++) OFFSETS.push([i * DX, j * DY]);
// Nearest first; of equally near slots, below before above and right before left.
OFFSETS.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2) || b[1] - a[1] || b[0] - a[0]);

const overlap = (a, b, gap) => a[0] < b[2] + gap && b[0] < a[2] + gap && a[1] < b[3] + gap && b[1] < a[3] + gap;
const union = rs => (rs.length ? [Math.min(...rs.map(r => r[0])), Math.min(...rs.map(r => r[1])), Math.max(...rs.map(r => r[2])), Math.max(...rs.map(r => r[3]))] : null);
const pad = (r, p) => r && [r[0] - p, r[1] - p, r[2] + p, r[3] + p];

// Positions for every node: saved ones as they are. With nothing saved yet,
// every node gets its slot in a grid of groups (gridPlace). Otherwise a new
// node goes in the free slot nearest the node it should sit beside (`near`,
// e.g. a fibre's other end) or the middle of its group's placed boxes; a group
// with nothing saved is laid out as in the grid and put in the free space
// nearest the middle of the map. A slot is free when its box clears every
// other box and growing its group to hold it doesn't make the group overlap a
// group it didn't already overlap. Nodes may give their `size` (default a box).
export function autoPlace(nodes, positions) {
  if (!nodes.some(n => positions[n.name])) return gridPlace(nodes, positions);
  const sorted = [...nodes].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const size = new Map(nodes.map(n => [n.name, n.size ?? BOX]));
  const members = new Map();
  for (const n of sorted) {
    if (!members.has(n.group)) members.set(n.group, []);
    members.get(n.group).push(n);
  }
  const out = {};
  for (const n of nodes) if (positions[n.name]) out[n.name] = positions[n.name];
  const rect = (name, [x, y]) => {
    const [w, h] = size.get(name);
    return [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
  };
  const placed = g => members.get(g).filter(n => out[n.name]).map(n => rect(n.name, out[n.name]));
  const centre = r => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
  // `items` are [name, position] pairs to add to group g together.
  const free = (g, items, groupsToo = true) => {
    const rs = items.map(([n, p]) => rect(n, p));
    const all = Object.entries(out).map(([n, p]) => rect(n, p));
    if (rs.some(r => all.some(q => overlap(r, q, GAP)))) return false;
    if (!groupsToo) return true;
    const before = pad(union(placed(g)), GROUP_PAD);
    const after = pad(union([...placed(g), ...rs]), GROUP_PAD);
    for (const h of members.keys()) {
      const other = h !== g && pad(union(placed(h)), GROUP_PAD);
      if (other && overlap(after, other, GAP) && !(before && overlap(before, other, GAP))) return false;
    }
    return true;
  };
  const put = (g, anchor, itemsAt) => {
    const at = off => itemsAt([anchor[0] + off[0], anchor[1] + off[1]]);
    const off = OFFSETS.find(o => free(g, at(o))) ?? OFFSETS.find(o => free(g, at(o), false)) ?? OFFSETS[0];
    for (const [n, p] of at(off)) out[n] = p;
  };
  const started = [...members.keys()].filter(g => placed(g).length);
  for (const g of started) {
    for (const n of members.get(g)) {
      if (out[n.name]) continue;
      const anchor = (n.near && out[n.near]) || centre(union(placed(g)));
      put(g, anchor, p => [[n.name, p]]);
    }
  }
  for (const g of members.keys()) {
    if (started.includes(g)) continue;
    const ms = members.get(g);
    const w = (Math.min(ms.length, COLS) - 1) * DX;
    const h = (Math.ceil(ms.length / COLS) - 1) * DY;
    const mid = centre(union(Object.entries(out).map(([n, p]) => rect(n, p))));
    put(g, mid, ([cx, cy]) => ms.map((n, i) => [n.name, [cx - w / 2 + (i % COLS) * DX, cy - h / 2 + Math.floor(i / COLS) * DY]]));
  }
  return out;
}

// Every node in its slot of a grid inside its group, for a map with nothing
// saved. A row of groups is as tall as its biggest group, so large groups
// don't run into the row below.
function gridPlace(nodes, positions) {
  const groups = new Map();
  for (const n of nodes) {
    if (!groups.has(n.group)) groups.set(n.group, []);
    groups.get(n.group).push(n.name);
  }
  const names = [...groups.keys()].sort();
  const out = {};
  let oy = 0;
  for (let r = 0; r * GROUP_COLS < names.length; r++) {
    const row = names.slice(r * GROUP_COLS, (r + 1) * GROUP_COLS);
    row.forEach((g, gc) => {
      const ox = gc * GROUP_DX;
      [...groups.get(g)].sort().forEach((n, i) => {
        out[n] = positions[n] ?? [ox + (i % COLS) * DX, oy + Math.floor(i / COLS) * DY];
      });
    });
    const tallest = Math.max(...row.map(g => Math.ceil(groups.get(g).length / COLS)));
    oy += Math.max(GROUP_DY, tallest * DY + GROUP_GAP);
  }
  return out;
}
