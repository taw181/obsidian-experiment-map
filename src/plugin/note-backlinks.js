import { Keymap, MarkdownView, TFile, debounce, getLinkpath } from 'obsidian';
import { mentionsFor } from './obsidian-io.js';
import { linkLines } from '../core/mentions.js';
import { noteName } from '../core/notes.js';

// The "Mentions" section at the foot of component and model notes: every page
// outside the map folder that links to the note, newest first, with the lines
// that link. It is drawn into the open note only; the file is never touched.
// One copy sits in reading view's footer and one under the editor, each just
// before Obsidian's own "backlinks in document" if that is on.
export class NoteBacklinks {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.shown = new Map(); // MarkdownView -> {path, key, els, run}
    this.updateSoon = debounce(() => this.updateAll(), 500, true);
    const ws = this.app.workspace;
    plugin.registerEvent(ws.on('layout-change', () => this.updateAll()));
    plugin.registerEvent(ws.on('file-open', () => this.updateAll()));
    plugin.registerEvent(this.app.metadataCache.on('resolved', () => this.updateSoon()));
    plugin.register(() => {
      for (const view of [...this.shown.keys()]) this.remove(view);
    });
  }

  isMapNote(path) {
    const cfg = this.plugin.config;
    return !!cfg && path.endsWith('.md')
      && [cfg.components_folder, cfg.models_folder].some(f => path.startsWith(`${f}/`));
  }

  updateAll() {
    const views = new Set();
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof MarkdownView) views.add(leaf.view);
    });
    for (const view of [...this.shown.keys()]) if (!views.has(view)) this.remove(view);
    for (const view of views) this.update(view);
  }

  remove(view) {
    for (const el of this.shown.get(view)?.els ?? []) el.remove();
    this.shown.delete(view);
  }

  async update(view) {
    const path = view.file?.path;
    if (!path || !this.isMapNote(path)) {
      this.remove(view);
      return;
    }
    let s = this.shown.get(view);
    if (!s) this.shown.set(view, s = { path: null, key: null, els: [], run: 0 });
    this.place(view, s);
    const run = ++s.run;
    const pages = mentionsFor(this.app, path, this.plugin.config.output_folder);
    // A new note or a changed list: names now, lines once the pages are read.
    if (s.path !== path || s.key?.names !== pages.join('\n')) {
      s.path = path;
      s.key = { names: pages.join('\n'), full: null };
      this.render(view, s, pages.map(p => ({ path: p, lines: [] })));
    }
    const withLines = await Promise.all(pages.map(async p => {
      const file = this.app.vault.getAbstractFileByPath(p);
      const text = file instanceof TFile ? await this.app.vault.cachedRead(file) : '';
      const isTarget = t => this.app.metadataCache.getFirstLinkpathDest(getLinkpath(t), p)?.path === path;
      return { path: p, lines: linkLines(text, isTarget) };
    }));
    if (run !== s.run || this.shown.get(view) !== s) return;
    const full = JSON.stringify(withLines);
    if (full === s.key.full) return;
    s.key.full = full;
    this.render(view, s, withLines);
  }

  // Puts the two copies in place, again if Obsidian rebuilt the containers.
  place(view, s) {
    const parents = [
      view.previewMode?.renderer?.footer?.el ?? view.contentEl.querySelector('.markdown-reading-view .mod-footer'),
      view.editMode?.sizerEl ?? view.contentEl.querySelector('.markdown-source-view .cm-sizer'),
    ];
    parents.forEach((parent, i) => {
      if (!parent) return;
      const el = s.els[i] ??= createDiv('em-note-backlinks');
      if (el.parentElement === parent) return;
      const before = view.backlinksEl?.parentElement === parent ? view.backlinksEl : null;
      parent.insertBefore(el, before);
    });
  }

  render(view, s, pages) {
    const open = (evt, p, line) => {
      evt.preventDefault();
      this.app.workspace.openLinkText(p, s.path, Keymap.isModEvent(evt), line === undefined ? undefined : { eState: { line } });
    };
    for (const el of s.els) {
      el.empty();
      const head = el.createDiv('em-note-backlinks-title');
      head.appendText('Mentions');
      if (pages.length) head.createSpan({ cls: 'em-note-backlinks-count', text: String(pages.length) });
      if (!pages.length) el.createDiv({ cls: 'em-muted', text: 'no pages link here yet' });
      for (const page of pages) {
        const row = el.createDiv('em-note-backlinks-page');
        const a = row.createEl('a', { cls: 'em-note-backlinks-name', text: noteName(page.path) });
        a.addEventListener('click', evt => open(evt, page.path));
        for (const l of page.lines) {
          const line = row.createDiv('em-note-backlinks-line');
          for (const seg of l.segments) {
            if (seg.hit) line.createSpan({ cls: 'em-note-backlinks-hit', text: seg.text });
            else line.appendText(seg.text);
          }
          line.addEventListener('click', evt => open(evt, page.path, l.line));
        }
      }
    }
  }
}
