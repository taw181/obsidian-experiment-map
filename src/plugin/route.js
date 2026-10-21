// Routes fibre lines around the boxes on the map. Cytoscape can't route
// edges, but it draws a 'segments' edge through the bend points it is given,
// so this works out the bend points and toSegments() converts them.
//
// A route runs along a sparse grid: the lines just outside each box (inflated
// by MARGIN), the lines through the fibre's two ends, and the lines midway
// between those. A* over that grid finds the shortest path that turns least
// (each turn costs BEND) and avoids running along a line an earlier fibre
// already uses (SHARED per unit of overlap).

export const MARGIN = 14;
const BEND = 40;
const SHARED = 1.5;
const EPS = 0.5;

const inside = (b, x, y) => x > b.x1 + EPS && x < b.x2 - EPS && y > b.y1 + EPS && y < b.y2 - EPS;
const grow = (b, m) => ({ x1: b.x1 - m, y1: b.y1 - m, x2: b.x2 + m, y2: b.y2 + m });

// The sorted coordinates of a grid axis, plus the midpoint of each gap.
function axis(values) {
  const v = [...new Set(values.map(n => Math.round(n * 2) / 2))].sort((a, b) => a - b);
  const out = [];
  v.forEach((n, i) => {
    if (i) out.push((v[i - 1] + n) / 2);
    out.push(n);
  });
  return out;
}

// A binary min-heap of [cost, state].
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(item) {
    const a = this.a;
    a.push(item);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

// Segments already taken by earlier fibres, by axis and the line they run along.
class Used {
  constructor() { this.lines = [new Map(), new Map()]; }
  add(dir, at, a, b) {
    const key = Math.round(at);
    const m = this.lines[dir];
    if (!m.has(key)) m.set(key, []);
    m.get(key).push([Math.min(a, b), Math.max(a, b)]);
  }
  overlap(dir, at, a, b) {
    const segs = this.lines[dir].get(Math.round(at));
    if (!segs) return 0;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    let sum = 0;
    for (const [s, e] of segs) sum += Math.max(0, Math.min(hi, e) - Math.max(lo, s));
    return sum;
  }
}

// One fibre: the corner points between `from` and `to` ([x, y] each), or null
// if there is no way round. Boxes that contain an end, even with their margin
// taken off, don't count; a box whose margin alone covers an end loses its margin.
function routeOne(from, to, boxes, used) {
  const obstacles = [];
  for (const b of boxes) {
    const g = grow(b, MARGIN);
    if (!inside(g, ...from) && !inside(g, ...to)) obstacles.push(g);
    else if (!inside(b, ...from) && !inside(b, ...to)) obstacles.push(b);
  }
  const xs = axis([from[0], to[0], ...obstacles.flatMap(b => [b.x1, b.x2])]);
  const ys = axis([from[1], to[1], ...obstacles.flatMap(b => [b.y1, b.y2])]);
  const nx = xs.length;
  const find = (arr, v) => arr.indexOf(Math.round(v * 2) / 2);
  const [si, sj, ti, tj] = [find(xs, from[0]), find(ys, from[1]), find(xs, to[0]), find(ys, to[1])];

  const blocked = (x, y) => obstacles.some(b => inside(b, x, y));
  // A step between neighbouring grid points crosses a box only if its midpoint
  // is inside one: every box edge is a grid line, so none lies between them.
  const free = new Map();
  const stepFree = (i, j, i2, j2) => {
    const key = `${Math.min(i, i2)},${Math.min(j, j2)},${i === i2 ? 1 : 0}`;
    let ok = free.get(key);
    if (ok === undefined) {
      ok = !blocked(xs[i2], ys[j2]) && !blocked((xs[i] + xs[i2]) / 2, (ys[j] + ys[j2]) / 2);
      free.set(key, ok);
    }
    return ok;
  };

  // State: grid point and the axis it was reached along (0 across, 1 down).
  const n = nx * ys.length * 2;
  const cost = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const h = (i, j) => Math.abs(xs[i] - xs[ti]) + Math.abs(ys[j] - ys[tj]);
  const heap = new Heap();
  for (const d of [0, 1]) {
    const s = (sj * nx + si) * 2 + d;
    cost[s] = 0;
    heap.push([h(si, sj), s]);
  }
  let goal = -1;
  while (heap.size) {
    const [f, s] = heap.pop();
    const d = s & 1, p = s >> 1, i = p % nx, j = (p - i) / nx;
    if (f - h(i, j) > cost[s] + 1e-9) continue;
    if (i === ti && j === tj) { goal = s; break; }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i2 = i + di, j2 = j + dj;
      if (i2 < 0 || i2 >= nx || j2 < 0 || j2 >= ys.length || !stepFree(i, j, i2, j2)) continue;
      const d2 = di ? 0 : 1;
      const len = di ? Math.abs(xs[i2] - xs[i]) : Math.abs(ys[j2] - ys[j]);
      const shared = di ? used.overlap(0, ys[j], xs[i], xs[i2]) : used.overlap(1, xs[i], ys[j], ys[j2]);
      const c = cost[s] + len + SHARED * shared + (d2 !== d ? BEND : 0);
      const s2 = (j2 * nx + i2) * 2 + d2;
      if (c < cost[s2] - 1e-9) {
        cost[s2] = c;
        prev[s2] = s;
        heap.push([c + h(i2, j2), s2]);
      }
    }
  }
  if (goal < 0) return null;

  const pts = [];
  for (let s = goal; s >= 0; s = prev[s]) {
    const p = s >> 1, i = p % nx;
    pts.push([xs[i], ys[(p - i) / nx]]);
  }
  pts.reverse();
  // Keep only the corners.
  const corners = pts.filter((q, k) => {
    if (k === 0 || k === pts.length - 1) return false;
    const [a, c] = [pts[k - 1], pts[k + 1]];
    return !((a[0] === q[0] && q[0] === c[0]) || (a[1] === q[1] && q[1] === c[1]));
  });
  const path = [from, ...corners, to];
  for (let k = 1; k < path.length; k++) {
    const [a, b] = [path[k - 1], path[k]];
    if (a[1] === b[1]) used.add(0, a[1], a[0], b[0]);
    else used.add(1, a[0], a[1], b[1]);
  }
  return corners;
}

// fibres: [{id, from: [x, y], to: [x, y], ends: [box id, box id]}]
// boxes: [{id, x1, y1, x2, y2}]
// Returns {fibre id: corners or null}. Fibres are routed in id order, so the
// same map always gives the same routes.
export function routeFibres(fibres, boxes) {
  const used = new Used();
  const out = {};
  for (const f of [...fibres].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const ends = new Set(f.ends);
    out[f.id] = routeOne(f.from, f.to, boxes.filter(b => !ends.has(b.id)), used);
  }
  return out;
}

// Corner points as Cytoscape 'segments' weights and distances, measured from
// the line between the two ends' centres (edge-distances: node-position).
export function toSegments(from, to, corners) {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const len2 = dx * dx + dy * dy;
  if (!len2) return null;
  const len = Math.sqrt(len2);
  const pts = corners.length ? corners : [[(from[0] + to[0]) / 2, (from[1] + to[1]) / 2]];
  const round = v => Math.round(v * 1000) / 1000;
  return {
    weights: pts.map(([x, y]) => round(((x - from[0]) * dx + (y - from[1]) * dy) / len2)),
    distances: pts.map(([x, y]) => round(((y - from[1]) * dx - (x - from[0]) * dy) / len)),
  };
}
