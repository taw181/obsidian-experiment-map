import { ItemView, Modal, Notice, Platform, Setting, TFile } from 'obsidian';
import { readTheme } from './style.js';
import { renderPanel } from './panel.js';
import { mentionsFor } from './obsidian-io.js';
import { applyLegacy, gridSize, snap } from '../core/layout.js';
import { setupVault } from './setup.js';
import { PRACTICE_CONFIG_PATH } from '../core/guide.js';
import { LINE_STYLES, lineStyle, lineStyleKeys, setLineStyles } from '../core/config.js';
import { MapCanvas } from './map-canvas.js';
import { CircleResizer } from './resize.js';

export const VIEW_TYPE = 'experiment-map';

export class MapView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.canvas = null;
    this.refreshTimer = null;
    this.listId = `em-names-${Math.random().toString(36).slice(2)}`;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Experiment map'; }
  getIcon() { return 'map'; }

  get selected() { return this.canvas?.selected ?? null; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('em-view');
    this.toolbarEl = root.createDiv('em-toolbar');
    this.errorEl = root.createDiv('em-error is-hidden');
    const body = root.createDiv('em-body');
    const stage = body.createDiv('em-stage');
    const bgEl = stage.createDiv('em-background');
    this.cyEl = stage.createDiv('em-canvas');
    const legendEl = stage.createDiv('em-legend');
    this.panelEl = body.createDiv('em-panel is-hidden');

    this.canvas = new MapCanvas({
      container: this.cyEl,
      legendEl,
      bgEl,
      theme: readTheme(document.body),
      onSelect: name => {
        if (name) this.showPanel(name);
        else this.hidePanel();
        this.resizer?.update();
      },
      onOpen: name => {
        const c = this.canvas.graph?.components[name];
        if (c) this.openLink(c.path);
      },
    });
    this.bindDrag();
    this.resizer = new CircleResizer({
      canvas: this.canvas,
      stage,
      grid: () => gridSize(this.canvas.config),
      commit: (node, d) => {
        this.pinUnsaved(node);
        const { x, y } = node.position();
        this.plugin.layout.set(node.id(), [x, y], d);
      },
    });

    const onChange = file => { if (this.isMapFile(file.path)) this.scheduleRefresh(); };
    this.registerEvent(this.app.metadataCache.on('changed', onChange));
    this.registerEvent(this.app.vault.on('delete', onChange));
    this.registerEvent(this.app.vault.on('create', onChange));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (this.isMapFile(file.path) || this.isMapFile(oldPath)) this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on('css-change', () => this.canvas?.setTheme(readTheme(document.body))));

    if (Platform.isMobile && !this.plugin.warnedMobile) {
      this.plugin.warnedMobile = true;
      new Notice('Experiment map has not been tested on mobile yet. It may be slow or misbehave; report problems at github.com/taw181/obsidian-experiment-map/issues.', 10000);
    }
    await this.refresh();
    this.plugin.sync({ quiet: true });
  }

  // No Config.md: the vault has no map yet. Offer to set one up.
  showEmptyState() {
    this.toolbarEl.empty();
    this.errorEl.empty();
    this.errorEl.createSpan({ text: 'This vault has no experiment map yet. ' });
    const b = this.errorEl.createEl('button', { text: 'Set up', cls: 'em-chip' });
    b.addEventListener('click', () => setupVault(this.plugin));
    const t = this.errorEl.createEl('button', { text: 'Try the practice map', cls: 'em-chip' });
    t.addEventListener('click', () => this.plugin.startGuide());
    if (this.plugin.hasPractice) {
      const p = this.errorEl.createEl('button', { text: 'Show the practice map', cls: 'em-chip' });
      p.addEventListener('click', () => this.plugin.showMap('practice'));
    }
    this.errorEl.removeClass('is-hidden');
  }

  // Another map is about to be drawn: forget this one's viewport, selection and chips.
  resetForMap() {
    this.canvas?.reset();
  }

  isMapFile(path) {
    // Checked first: with no map yet there is no config, and a Config.md that
    // arrives (git pull, made by hand) must still bring the view to life.
    if (path === this.plugin.settings.configPath || path === PRACTICE_CONFIG_PATH) return true;
    const c = this.plugin.config;
    if (!c) return false;
    return path.startsWith(`${c.components_folder}/`) || path.startsWith(`${c.models_folder}/`);
  }

  scheduleRefresh(delay = 300) {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.refresh(), delay);
  }

  async refresh() {
    if (!this.canvas) return;
    let loaded;
    try {
      loaded = await this.plugin.loadGraph();
    } catch (e) {
      if (e.stale) return;
      if (e.missing) {
        this.showEmptyState();
        return;
      }
      // e.g. a broken Config.md: keep the last drawing and say why it isn't updating.
      // The toolbar stays usable, so Sync can be pressed again after the fix.
      this.plugin.noticeOnce(`Experiment map: ${e.message}`);
      this.errorEl.setText(`⚠ ${e.message}`);
      this.errorEl.removeClass('is-hidden');
      if (!this.canvas.graph) {
        this.toolbarEl.empty();
        const b = this.toolbarEl.createEl('button', { text: 'Sync', cls: 'em-chip' });
        b.addEventListener('click', () => this.plugin.sync());
      }
      return;
    }
    if (!this.canvas) return;
    this.errorEl.empty();
    this.errorEl.addClass('is-hidden');
    const { config, graph } = loaded;
    const flagged = new Set(graph.problems.map(p => p.subject).filter(Boolean));
    this.canvas.setData({ graph, config, positions: this.plugin.layout.all(), flagged });
    this.renderToolbar();
    this.renderBackground();
  }

  // Automatically placed boxes in the same groups as `moved` are saved where
  // they are now, so moving or resizing something doesn't rearrange them.
  pinUnsaved(moved) {
    const saved = applyLegacy(this.plugin.layout.all(), this.plugin.layout.legacy);
    moved.parent().children().forEach(n => {
      if (saved[n.id()] || moved.contains(n)) return;
      const { x, y } = n.position();
      this.plugin.layout.set(n.id(), [x, y]);
    });
  }

  bindDrag() {
    this.canvas.cy.on('dragfree', 'node', e => {
      const moved = (e.target.data('isGroup') ? e.target.descendants() : e.target).filter(n => !n.data('isGroup'));
      if (moved.empty()) return;
      // A dropped box snaps to the grid; a dropped group moves as one, by the
      // step that puts its first box on the grid, so its arrangement is kept.
      this.pinUnsaved(moved);
      const p = moved[0].position();
      const [sx, sy] = snap([p.x, p.y], gridSize(this.canvas.config));
      const [dx, dy] = [sx - p.x, sy - p.y];
      moved.forEach(n => {
        // position() is Cytoscape's live object, so read it before moving the box.
        const { x, y } = n.position();
        if (dx || dy) n.position({ x: x + dx, y: y + dy });
        this.plugin.layout.set(n.id(), [x + dx, y + dy]);
      });
    });
  }

  renderToolbar() {
    const bar = this.toolbarEl;
    const canvas = this.canvas;
    const { state } = canvas;
    bar.empty();
    const chip = (parent, label, on, onClick, title) => {
      const b = parent.createEl('button', { text: label, cls: `em-chip${on ? ' is-on' : ''}`, attr: title ? { 'aria-label': title } : {} });
      b.addEventListener('click', onClick);
      return b;
    };
    const toggled = () => { canvas.applyVisibility(); this.renderToolbar(); };

    if (this.plugin.hasPractice) {
      const maps = bar.createDiv('em-group');
      maps.createSpan({ text: 'Map', cls: 'em-muted' });
      chip(maps, 'Real', this.plugin.activeMap === 'real', () => this.plugin.showMap('real'), 'Your lab\'s map');
      chip(maps, 'Practice', this.plugin.activeMap === 'practice', () => this.plugin.showMap('practice'), 'The getting-started practice map');
    }

    const layers = bar.createDiv('em-group');
    layers.createSpan({ text: 'Layers', cls: 'em-muted' });
    for (const [k, label] of [['beam', 'Beams'], ['rf', 'RF'], ['control', 'Control']]) {
      chip(layers, label, state.layers[k], () => { state.layers[k] = !state.layers[k]; toggled(); });
    }

    const show = bar.createDiv('em-group');
    show.createSpan({ text: 'Show', cls: 'em-muted' });
    for (const x of canvas.knownExperiments) {
      chip(show, x, state.experiments.has(x), () => {
        if (state.experiments.has(x)) state.experiments.delete(x);
        else state.experiments.add(x);
        toggled();
      });
    }
    for (const t of canvas.config.filter_tags) {
      chip(show, t, !state.hiddenTags.has(t), () => {
        if (state.hiddenTags.has(t)) state.hiddenTags.delete(t);
        else state.hiddenTags.add(t);
        toggled();
      });
    }
    chip(show, 'Spare/retired', state.showRetired, () => { state.showRetired = !state.showRetired; toggled(); });

    const actions = bar.createDiv('em-group em-actions');
    const search = actions.createEl('input', { type: 'search', cls: 'em-search', attr: { placeholder: 'Find component…', list: this.listId } });
    const list = actions.createEl('datalist', { attr: { id: this.listId } });
    for (const n of Object.keys(canvas.graph.components)) list.createEl('option', { attr: { value: n } });
    search.addEventListener('change', () => canvas.find(search.value.trim()));
    const count = canvas.graph.problems.length;
    chip(actions, `⚠ ${count}`, count > 0, () => new ProblemsModal(this.app, canvas.graph.problems, s => (canvas.graph.components[s] ? canvas.find(s) : this.openLink(s))).open(), 'Problems');
    chip(actions, '+', false, () => this.plugin.newComponent(canvas.selected), 'New component');
    chip(actions, 'Sync', false, () => this.plugin.sync(), 'Sync with the channel sources');
    chip(actions, 'Fit', false, () => canvas.fit(), 'Fit map to view');
    chip(actions, '⚙', false, () => new SettingsModal(this.app, canvas.config, this.plugin.configPath()).open(), 'Map settings');
  }

  showPanel(name) {
    const { graph, config } = this.canvas;
    renderPanel(this.panelEl, name, {
      graph,
      channelSources: this.plugin.channelSources,
      mentions: mentionsFor(this.app, graph.components[name].path, config.output_folder),
      select: n => this.canvas.find(n),
      openLink: l => this.openLink(l),
      close: () => this.canvas.clearSelection(),
    });
  }

  hidePanel() {
    this.panelEl.empty();
    this.panelEl.addClass('is-hidden');
  }

  openLink(linktext) {
    this.app.workspace.openLinkText(linktext, '', 'tab');
  }

  renderBackground() {
    const bg = this.canvas.config.background;
    if (!bg || !bg.image) {
      this.canvas.setBackground(null);
      return;
    }
    const linkpath = String(bg.image).replace(/^!?\[\[|\]\]$/g, '');
    const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, '');
    if (!file) console.warn(`experiment-map: background image '${bg.image}' not found`);
    this.canvas.setBackground(file ? this.app.vault.getResourcePath(file) : null);
  }

  onResize() {
    this.canvas?.resize();
    this.contentEl.toggleClass('is-narrow', this.contentEl.clientWidth < 700);
  }

  async onClose() {
    clearTimeout(this.refreshTimer);
    this.resizer?.destroy();
    this.resizer = null;
    this.canvas?.destroy();
    this.canvas = null;
  }
}

const STYLE_LABELS = { straight: 'Straight', curved: 'Curved', right_angles: 'Right angles', avoid_components: 'Avoid components' };
const KEY_LABELS = { beam: 'Beams', rf: 'RF', control: 'Control' };

// Map settings shared by everyone: each change is written to Config.md at once,
// and the view redraws when it sees the file change.
class SettingsModal extends Modal {
  constructor(app, config, configPath) {
    super(app);
    this.config = config;
    this.configPath = configPath;
  }

  onOpen() {
    this.titleEl.setText('Map settings');
    new Setting(this.contentEl).setName('Line style').setHeading();
    const styles = { ...this.config.line_styles };
    for (const k of lineStyleKeys(this.config)) {
      styles[k] = lineStyle(this.config, k);
      new Setting(this.contentEl).setName(KEY_LABELS[k] ?? k[0].toUpperCase() + k.slice(1)).addDropdown(d => {
        for (const s of LINE_STYLES) d.addOption(s, STYLE_LABELS[s]);
        d.setValue(styles[k]);
        d.onChange(async v => {
          styles[k] = v;
          const file = this.app.vault.getAbstractFileByPath(this.configPath);
          if (!(file instanceof TFile)) {
            new Notice(`Experiment map: ${this.configPath} not found`);
            return;
          }
          await this.app.vault.process(file, text => setLineStyles(text, styles));
        });
      });
    }
    this.contentEl.createDiv({ cls: 'em-muted', text: `Saved in ${this.configPath}, so it changes the map for everyone who shares this vault.` });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ProblemsModal extends Modal {
  constructor(app, problems, onPick) {
    super(app);
    this.problems = problems;
    this.onPick = onPick;
  }

  onOpen() {
    this.titleEl.setText(`Experiment map: ${this.problems.length} problem${this.problems.length === 1 ? '' : 's'}`);
    if (!this.problems.length) {
      this.contentEl.createEl('p', { text: 'No problems.' });
      return;
    }
    const ul = this.contentEl.createEl('ul');
    for (const p of this.problems) {
      const li = ul.createEl('li');
      if (p.subject) {
        const a = li.createEl('a', { text: p.subject, href: '#' });
        a.addEventListener('click', ev => {
          ev.preventDefault();
          this.close();
          this.onPick(p.subject);
        });
        li.appendText(': ');
      }
      li.appendText(p.message);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
