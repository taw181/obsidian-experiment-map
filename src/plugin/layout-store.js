import { Notice, normalizePath } from 'obsidian';
import { parseLayout, serializeLayout, applyLegacy } from '../core/layout.js';

// Box positions in layout.json. Local moves are kept in `pending` and merged
// onto a fresh read of the file at save time, so a pull that changed other
// boxes in the meantime is not overwritten.
export class LayoutStore {
  constructor(app) {
    this.app = app;
    this.path = null;
    this.loaded = false;
    this.broken = false;
    this.disk = {};
    this.pending = new Map();
    this.keep = null;
    this.legacy = {};
    this.timer = null;
  }

  setPath(p) {
    const path = normalizePath(p);
    if (path !== this.path) {
      this.path = path;
      this.loaded = false;
    }
  }

  async read() {
    const adapter = this.app.vault.adapter;
    return (await adapter.exists(this.path)) ? adapter.read(this.path) : null;
  }

  async load() {
    if (!this.path) return;
    const r = parseLayout(await this.read());
    if (!r.ok) {
      const n = Object.keys(r.positions).length;
      if (!this.broken) new Notice(`Experiment map: ${this.path} could not be read (a git conflict?). Kept ${n} position${n === 1 ? '' : 's'} that could be recovered; the rest are arranged automatically. Moving a box rewrites the file.`, 10000);
      this.broken = true;
      this.disk = r.positions;
    } else {
      this.broken = false;
      this.disk = r.positions;
    }
    this.loaded = true;
  }

  all() {
    const out = { ...this.disk };
    for (const [k, v] of this.pending) {
      if (v) out[k] = v;
      else delete out[k];
    }
    return out;
  }

  set(name, xy) {
    this.pending.set(name, [Math.round(xy[0]), Math.round(xy[1])]);
    this.scheduleSave(true);
  }

  // Moves a box's entry, or both of a fibre's end entries (`name#in`, `name#out`).
  rename(oldName, newName) {
    const all = this.all();
    let moved = false;
    for (const suffix of ['', '#in', '#out']) {
      const xy = all[oldName + suffix];
      if (!xy) continue;
      this.pending.set(newName + suffix, xy);
      this.pending.set(oldName + suffix, null);
      // The keep list is refreshed only when the map is open; don't let it drop the new name.
      this.keep?.add(newName + suffix);
      moved = true;
    }
    if (moved) this.scheduleSave(false);
  }

  setKeep(names, legacy = {}) {
    this.keep = names ? new Set(names) : null;
    this.legacy = legacy;
  }

  // A broken file is only replaced by a drag (force), never by a rename.
  scheduleSave(force) {
    if (this.broken && !force) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 1000);
  }

  async save() {
    this.timer = null;
    if (!this.path) return;
    const text = await this.read();
    const r = parseLayout(text);
    this.disk = r.positions;
    const merged = applyLegacy(this.all(), this.legacy);
    this.pending.clear();
    this.disk = merged;
    this.broken = false;
    const out = serializeLayout(merged, this.keep);
    if (out !== text) await this.app.vault.adapter.write(this.path, out);
  }
}
