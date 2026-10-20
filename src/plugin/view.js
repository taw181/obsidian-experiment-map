import { ItemView, Modal, Notice, Platform } from 'obsidian';
import cytoscape from 'cytoscape';
import { buildStyle, readTheme } from './style.js';
import { toElements } from './elements.js';
import { renderPanel } from './panel.js';
import { mentionsFor } from './obsidian-io.js';
import { chainOf } from '../core/trace.js';
import { applyLegacy, gridSize, snap } from '../core/layout.js';
import { setupVault } from './setup.js';
import { PRACTICE_CONFIG_PATH } from '../core/guide.js';

export const VIEW_TYPE = 'experiment-map';

// The component a map element stands for: a fibre's end markers and its edge
// carry the fibre's name; a box's id is its name.
const componentOf = ele => ele.data('component') ?? ele.id();

export class MapView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.cy = null;
    this.graph = null;
    this.config = null;
    this.selected = null;
    this.fitted = false;
    this.refreshTimer = null;
    this.bgImg = null;
    this.knownExperiments = [];
    this.state = { layers: { beam: true, rf: false, control: false }, experiments: null, hiddenTags: new Set(), showRetired: false, legendOpen: true };
    this.listId = `em-names-${Math.random().toString(36).slice(2)}`;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return 'Experiment map'; }
  getIcon() { return 'map'; }

  async onOpen() {
    const root = this.contentEl;
    root.empty();
    root.addClass('em-view');
    this.toolbarEl = root.createDiv('em-toolbar');
    this.errorEl = root.createDiv('em-error is-hidden');
    const body = root.createDiv('em-body');
    const stage = body.createDiv('em-stage');
    this.bgEl = stage.createDiv('em-background');
    this.cyEl = stage.createDiv('em-canvas');
    this.legendEl = stage.createDiv('em-legend');
    this.panelEl = body.createDiv('em-panel is-hidden');

    this.cy = cytoscape({
      container: this.cyEl,
      style: buildStyle(readTheme(document.body)),
      wheelSensitivity: 2,
      minZoom: 0.1,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    this.bindGraphEvents();

    const onChange = file => { if (this.isMapFile(file.path)) this.scheduleRefresh(); };
    this.registerEvent(this.app.metadataCache.on('changed', onChange));
    this.registerEvent(this.app.vault.on('delete', onChange));
    this.registerEvent(this.app.vault.on('create', onChange));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (this.isMapFile(file.path) || this.isMapFile(oldPath)) this.scheduleRefresh();
    }));
    this.registerEvent(this.app.workspace.on('css-change', () => this.cy?.style(buildStyle(readTheme(document.body)))));

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
    this.fitted = false;
    this.selected = null;
    this.state.experiments = null;
    this.knownExperiments = [];
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
    if (!this.cy) return;
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
      if (!this.graph) {
        this.toolbarEl.empty();
        const b = this.toolbarEl.createEl('button', { text: 'Sync', cls: 'em-chip' });
        b.addEventListener('click', () => this.plugin.sync());
      }
      return;
    }
    if (!this.cy) return;
    this.errorEl.empty();
    this.errorEl.addClass('is-hidden');
    const { config, graph } = loaded;
    this.config = config;
    this.graph = graph;

    const experiments = [...new Set([...config.channel_sources.map(h => h.experiment), ...Object.values(graph.components).flatMap(c => c.props.experiment ?? [])])].sort();
    if (!this.state.experiments) this.state.experiments = new Set(experiments);
    else for (const e of experiments) if (!this.knownExperiments.includes(e)) this.state.experiments.add(e);
    this.knownExperiments = experiments;
    // A tag dropped from Config.md loses its chip, so nothing should stay hidden by it.
    for (const t of this.state.hiddenTags) if (!config.filter_tags.includes(t)) this.state.hiddenTags.delete(t);

    const flagged = new Set(graph.problems.map(p => p.subject).filter(Boolean));
    const els = toElements(graph, config, this.plugin.layout.all(), flagged);
    const zoom = this.cy.zoom();
    const pan = { ...this.cy.pan() };
    this.cy.batch(() => {
      this.cy.elements().remove();
      this.cy.add(els);
    });
    if (!this.fitted && els.length) {
      // Fit once there is something to fit (a new practice map starts empty),
      // without blowing a map of one or two boxes up to full size.
      this.cy.fit(undefined, 40);
      if (this.cy.zoom() > 1) {
        this.cy.zoom(1);
        this.cy.center();
      }
      this.fitted = true;
    } else {
      this.cy.viewport({ zoom, pan });
    }
    this.renderToolbar();
    this.renderBackground();
    if (this.selected && graph.components[this.selected]) this.select(this.selected);
    else this.clearSelection();
  }

  bindGraphEvents() {
    const cy = this.cy;
    cy.on('tap', 'node, edge.link', e => {
      if (!e.target.data('isGroup')) this.select(componentOf(e.target));
    });
    cy.on('tap', e => {
      if (e.target === cy) this.clearSelection();
    });
    cy.on('dragfree', 'node', e => {
      const moved = (e.target.data('isGroup') ? e.target.descendants() : e.target).filter(n => !n.data('isGroup'));
      if (moved.empty()) return;
      // A dropped box snaps to the grid; a dropped group moves as one, by the
      // step that puts its first box on the grid, so its arrangement is kept.
      // Automatically placed boxes in the same groups are saved where they are
      // now, so rearranging a group doesn't move them.
      const saved = applyLegacy(this.plugin.layout.all(), this.plugin.layout.legacy);
      moved.parent().children().forEach(n => {
        if (saved[n.id()] || moved.contains(n)) return;
        const { x, y } = n.position();
        this.plugin.layout.set(n.id(), [x, y]);
      });
      const p = moved[0].position();
      const [sx, sy] = snap([p.x, p.y], gridSize(this.config));
      const [dx, dy] = [sx - p.x, sy - p.y];
      moved.forEach(n => {
        // position() is Cytoscape's live object, so read it before moving the box.
        const { x, y } = n.position();
        if (dx || dy) n.position({ x: x + dx, y: y + dy });
        this.plugin.layout.set(n.id(), [x + dx, y + dy]);
      });
    });
    cy.on('viewport', () => this.positionBackground());
    cy.on('dbltap', 'node, edge.link', e => {
      const c = this.graph?.components[componentOf(e.target)];
      if (c) this.openLink(c.path);
    });
  }

  applyVisibility() {
    const { layers, experiments, hiddenTags, showRetired } = this.state;
    this.cy.batch(() => {
      this.cy.nodes().forEach(n => {
        if (n.data('isGroup')) return;
        const status = n.data('status');
        const exps = n.data('experiment');
        const hide = (!showRetired && (status === 'retired' || status === 'spare'))
          || (exps.length > 0 && !exps.some(x => experiments.has(x)))
          || hiddenTags.has(n.data('filterTag'));
        n.toggleClass('hidden', hide);
      });
      this.cy.nodes().forEach(n => {
        if (n.data('isGroup')) n.toggleClass('hidden', n.children().every(ch => ch.hasClass('hidden')));
      });
      this.cy.edges().forEach(e => {
        // A fibre with hide_line shows its line only while its chain is selected.
        const on = (layers[e.data('kind')] && !e.hasClass('hide-line')) || e.hasClass('lit');
        e.toggleClass('hidden', !on || e.source().hasClass('hidden') || e.target().hasClass('hidden'));
      });
    });
    this.renderLegend();
  }

  renderToolbar() {
    const bar = this.toolbarEl;
    bar.empty();
    const chip = (parent, label, on, onClick, title) => {
      const b = parent.createEl('button', { text: label, cls: `em-chip${on ? ' is-on' : ''}`, attr: title ? { 'aria-label': title } : {} });
      b.addEventListener('click', onClick);
      return b;
    };
    const toggled = () => { this.applyVisibility(); this.renderToolbar(); };

    if (this.plugin.hasPractice) {
      const maps = bar.createDiv('em-group');
      maps.createSpan({ text: 'Map', cls: 'em-muted' });
      chip(maps, 'Real', this.plugin.activeMap === 'real', () => this.plugin.showMap('real'), 'Your lab\'s map');
      chip(maps, 'Practice', this.plugin.activeMap === 'practice', () => this.plugin.showMap('practice'), 'The getting-started practice map');
    }

    const layers = bar.createDiv('em-group');
    layers.createSpan({ text: 'Layers', cls: 'em-muted' });
    for (const [k, label] of [['beam', 'Beams'], ['rf', 'RF'], ['control', 'Control']]) {
      chip(layers, label, this.state.layers[k], () => { this.state.layers[k] = !this.state.layers[k]; toggled(); });
    }

    const show = bar.createDiv('em-group');
    show.createSpan({ text: 'Show', cls: 'em-muted' });
    for (const x of this.knownExperiments) {
      chip(show, x, this.state.experiments.has(x), () => {
        if (this.state.experiments.has(x)) this.state.experiments.delete(x);
        else this.state.experiments.add(x);
        toggled();
      });
    }
    for (const t of this.config.filter_tags) {
      chip(show, t, !this.state.hiddenTags.has(t), () => {
        if (this.state.hiddenTags.has(t)) this.state.hiddenTags.delete(t);
        else this.state.hiddenTags.add(t);
        toggled();
      });
    }
    chip(show, 'Spare/retired', this.state.showRetired, () => { this.state.showRetired = !this.state.showRetired; toggled(); });

    const actions = bar.createDiv('em-group em-actions');
    const search = actions.createEl('input', { type: 'search', cls: 'em-search', attr: { placeholder: 'Find component…', list: this.listId } });
    const list = actions.createEl('datalist', { attr: { id: this.listId } });
    for (const n of Object.keys(this.graph.components)) list.createEl('option', { attr: { value: n } });
    search.addEventListener('change', () => this.find(search.value.trim()));
    const count = this.graph.problems.length;
    chip(actions, `⚠ ${count}`, count > 0, () => new ProblemsModal(this.app, this.graph.problems, s => (this.graph.components[s] ? this.find(s) : this.openLink(s))).open(), 'Problems');
    chip(actions, '+', false, () => this.plugin.newComponent(this.selected), 'New component');
    chip(actions, 'Sync', false, () => this.plugin.sync(), 'Sync with the channel sources');
    chip(actions, 'Fit', false, () => this.cy.fit(this.cy.elements(':visible'), 40), 'Fit map to view');
  }

  find(name) {
    const n = this.cy.nodes().filter(x => !x.data('isGroup') && componentOf(x) === name);
    if (n.empty()) return;
    this.select(name);
    if (n.length === 1) {
      this.cy.animate({ center: { eles: n }, zoom: Math.max(this.cy.zoom(), 1) }, { duration: 250 });
      return;
    }
    // Both ends of a fibre: fit them, but don't zoom in further than now.
    const before = { zoom: this.cy.zoom(), pan: { ...this.cy.pan() } };
    this.cy.fit(n, 80);
    const zoom = Math.min(this.cy.zoom(), Math.max(before.zoom, 1));
    this.cy.viewport(before);
    this.cy.animate({ center: { eles: n }, zoom }, { duration: 250 });
  }

  select(name) {
    if (!this.graph?.components[name]) return;
    this.selected = name;
    const { nodes, edges } = chainOf(this.graph, name);
    this.cy.batch(() => {
      this.cy.elements().removeClass('lit dim root');
      this.cy.nodes().forEach(n => {
        if (n.data('isGroup')) return;
        n.addClass(nodes.has(componentOf(n)) ? 'lit' : 'dim');
        if (componentOf(n) === name) n.addClass('root');
      });
      this.cy.edges().forEach(e => e.addClass(edges.has(e.id()) || nodes.has(e.data('component')) ? 'lit' : 'dim'));
    });
    this.applyVisibility();
    this.showPanel(name);
  }

  clearSelection() {
    this.selected = null;
    this.cy.elements().removeClass('lit dim root');
    this.applyVisibility();
    this.panelEl.empty();
    this.panelEl.addClass('is-hidden');
  }

  showPanel(name) {
    renderPanel(this.panelEl, name, {
      graph: this.graph,
      channelSources: this.plugin.channelSources,
      mentions: mentionsFor(this.app, this.graph.components[name].path, this.config.output_folder),
      select: n => this.find(n),
      openLink: l => this.openLink(l),
      close: () => this.clearSelection(),
    });
  }

  openLink(linktext) {
    this.app.workspace.openLinkText(linktext, '', 'tab');
  }

  renderLegend() {
    const el = this.legendEl;
    const cfg = this.config;
    el.empty();
    const head = el.createDiv({ cls: 'em-legend-head', text: this.state.legendOpen ? 'Legend ▾' : 'Legend ▸' });
    head.addEventListener('click', () => { this.state.legendOpen = !this.state.legendOpen; this.renderLegend(); });
    if (!this.state.legendOpen) return;
    const row = (sample, text) => {
      const r = el.createDiv('em-legend-row');
      sample(r.createSpan('em-legend-sample'));
      r.createSpan({ text });
    };
    const line = (color, style, width = 3) => s => { s.addClass('em-legend-line'); s.style.borderTop = `${width}px ${style} ${color}`; };
    const box = cls => s => s.addClass('em-legend-box', cls);
    // only the beam colours on the map: beams between nodes that are shown
    const drawn = new Set(this.cy.edges('[kind = "beam"]')
      .filter(e => !e.source().hasClass('hidden') && !e.target().hasClass('hidden'))
      .map(e => e.data('color')));
    const wl = Object.keys(cfg.wavelength_colors ?? {})
      .filter(nm => drawn.has(cfg.wavelength_colors[nm]))
      .sort((a, b) => Number(a) - Number(b));
    for (const nm of wl) row(line(cfg.wavelength_colors[nm], 'solid', 4), `beam, ${nm} nm`);
    if (drawn.has(cfg.default_wavelength_color) || !wl.length) row(line(cfg.default_wavelength_color, 'solid', 4), wl.length ? 'beam, other wavelength' : 'beam');
    row(line(cfg.rf_color, 'dashed'), 'RF (layer: RF)');
    row(line(cfg.control_color, 'dotted'), 'control (layer: Control)');
    row(box('is-optical'), 'optical component');
    row(box('is-electronics'), 'electronics');
    row(box('is-round'), 'destination');
    row(box('is-broken'), 'status: broken');
    row(box('is-problem'), '⚠ has a problem');
  }

  renderBackground() {
    this.bgEl.empty();
    this.bgImg = null;
    const bg = this.config.background;
    if (!bg || !bg.image) return;
    const linkpath = String(bg.image).replace(/^!?\[\[|\]\]$/g, '');
    const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, '');
    if (!file) {
      console.warn(`experiment-map: background image '${bg.image}' not found`);
      return;
    }
    this.bgImg = this.bgEl.createEl('img', { attr: { src: this.app.vault.getResourcePath(file), draggable: 'false', alt: '' } });
    this.positionBackground();
  }

  positionBackground() {
    if (!this.bgImg || !this.cy) return;
    const bg = this.config.background;
    const z = this.cy.zoom();
    const p = this.cy.pan();
    const s = Number(bg.scale ?? 1);
    const x = Number(bg.x ?? 0);
    const y = Number(bg.y ?? 0);
    this.bgImg.style.transform = `translate(${p.x + x * z}px, ${p.y + y * z}px) scale(${s * z})`;
  }

  onResize() {
    this.cy?.resize();
    this.contentEl.toggleClass('is-narrow', this.contentEl.clientWidth < 700);
  }

  async onClose() {
    clearTimeout(this.refreshTimer);
    this.cy?.destroy();
    this.cy = null;
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
