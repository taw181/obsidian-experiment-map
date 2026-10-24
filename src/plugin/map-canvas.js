import cytoscape from 'cytoscape';
import { buildStyle } from './style.js';
import { toElements } from './elements.js';
import { chainOf } from '../core/trace.js';
import { routeLines, toSegments } from './route.js';

// The drawing itself: the Cytoscape canvas, what is shown, selection, routing
// and the legend. Nothing here imports Obsidian, so the read-only web map
// (src/web) draws with the same code as the plugin's view. DOM helpers like
// createDiv() come from Obsidian in the plugin and from src/web/dom.js on the web.

// The component a map element stands for: a fibre's end markers and its edge
// carry the fibre's name; a box's id is its name.
export const componentOf = ele => ele.data('component') ?? ele.id();

export class MapCanvas {
  // onSelect(name | null) runs after the selection changes; onOpen(name) on a
  // double tap of a box or a link component's line.
  constructor({ container, legendEl, bgEl, theme, onSelect = () => {}, onOpen = () => {} }) {
    this.legendEl = legendEl;
    this.bgEl = bgEl;
    this.onSelect = onSelect;
    this.onOpen = onOpen;
    this.graph = null;
    this.config = null;
    this.selected = null;
    this.fitted = false;
    this.routeFrame = null;
    this.bgImg = null;
    this.knownExperiments = [];
    this.state = { layers: { beam: true, rf: false, control: false }, experiments: null, hiddenTags: new Set(), showRetired: false, legendOpen: true };
    this.cy = cytoscape({
      container,
      style: buildStyle(theme),
      wheelSensitivity: 2,
      minZoom: 0.1,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autounselectify: true,
    });
    this.bindEvents();
  }

  // Another map is about to be drawn: forget this one's viewport, selection and chips.
  reset() {
    this.fitted = false;
    this.selected = null;
    this.state.experiments = null;
    this.knownExperiments = [];
  }

  setData({ graph, config, positions, flagged }) {
    this.config = config;
    this.graph = graph;

    const experiments = [...new Set([...config.channel_sources.map(h => h.experiment), ...Object.values(graph.components).flatMap(c => c.props.experiment ?? [])])].sort();
    if (!this.state.experiments) this.state.experiments = new Set(experiments);
    else for (const e of experiments) if (!this.knownExperiments.includes(e)) this.state.experiments.add(e);
    this.knownExperiments = experiments;
    // A tag dropped from Config.md loses its chip, so nothing should stay hidden by it.
    for (const t of this.state.hiddenTags) if (!config.filter_tags.includes(t)) this.state.hiddenTags.delete(t);

    const els = toElements(graph, config, positions, flagged);
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
    if (this.selected && graph.components[this.selected]) this.select(this.selected);
    else this.clearSelection();
  }

  bindEvents() {
    const cy = this.cy;
    cy.on('tap', 'node, edge.link', e => {
      if (!e.target.data('isGroup')) this.select(componentOf(e.target));
    });
    cy.on('tap', e => {
      if (e.target === cy) this.clearSelection();
    });
    // Lines are re-routed at most once a frame while anything moves.
    cy.on('position', 'node', () => {
      if (this.routeFrame == null) this.routeFrame = requestAnimationFrame(() => { this.routeFrame = null; this.routeLines(); });
    });
    cy.on('viewport', () => this.positionBackground());
    cy.on('dbltap', 'node, edge.link', e => {
      if (!e.target.data('isGroup')) this.onOpen(componentOf(e.target));
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
    this.routeLines();
    this.renderLegend();
  }

  // Routes each shown line whose style avoids components around the shown
  // boxes and markers (route.js). Hidden boxes don't count, so this runs again
  // whenever visibility changes.
  routeLines() {
    if (!this.cy) return;
    const lines = this.cy.edges('.line-avoid_components').filter(e => !e.hasClass('hidden'));
    if (lines.empty()) return;
    const boxes = this.cy.nodes().filter(n => !n.data('isGroup') && !n.hasClass('hidden')).map(n => {
      const { x1, y1, x2, y2 } = n.boundingBox({ includeLabels: true, includeOverlays: false });
      return { id: n.id(), x1, y1, x2, y2 };
    });
    const at = n => [n.position('x'), n.position('y')];
    // A beam leaving from a port starts at the port's side, not the box centre.
    const start = e => {
      const [x, y] = at(e.source());
      const p = /^(-?[\d.]+)% (-?[\d.]+)%$/.exec(e.data('sourceEndpoint') ?? '');
      return p ? [x + (p[1] / 100) * e.source().width(), y + (p[2] / 100) * e.source().height()] : [x, y];
    };
    const routed = lines.map(e => ({ id: e.id(), from: start(e), to: at(e.target()), centres: [at(e.source()), at(e.target())], ends: [e.source().id(), e.target().id()] }));
    const routes = routeLines(routed, boxes);
    this.cy.batch(() => routed.forEach(l => {
      const e = this.cy.getElementById(l.id);
      const seg = routes[l.id] && toSegments(...l.centres, routes[l.id]);
      if (!seg) {
        e.removeClass('routed');
        return;
      }
      e.data({ segWeights: seg.weights, segDistances: seg.distances });
      e.addClass('routed');
    }));
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

  fit() {
    this.cy.fit(this.cy.elements(':visible'), 40);
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
    this.onSelect(name);
  }

  clearSelection() {
    this.selected = null;
    this.cy.elements().removeClass('lit dim root');
    this.applyVisibility();
    this.onSelect(null);
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
    const round = Object.keys(cfg.types).filter(t => cfg.types[t]?.shape === 'round');
    if (round.length) row(box('is-round'), round.join(', '));
    row(box('is-broken'), 'status: broken');
    row(box('is-problem'), '⚠ has a problem');
  }

  // src: a URL for the config's background image, or null for none.
  setBackground(src) {
    this.bgEl.empty();
    this.bgImg = null;
    if (!src) return;
    this.bgImg = this.bgEl.createEl('img', { attr: { src, draggable: 'false', alt: '' } });
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

  setTheme(theme) {
    this.cy?.style(buildStyle(theme));
  }

  resize() {
    this.cy?.resize();
  }

  destroy() {
    if (this.routeFrame != null) cancelAnimationFrame(this.routeFrame);
    this.cy?.destroy();
    this.cy = null;
  }
}
