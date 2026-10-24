// The read-only web map: the plugin's MapCanvas and panel over what
// `cli.js web-export` wrote. Boxes can be selected, found and opened, never moved
// or edited. A page calls ExperimentMap.mount(el, { dataUrl, noteHref }), where
// noteHref(linktext or vault path) gives the URL of that note on the site, or null.
import { installDomHelpers } from './dom.js';
import { memoryIo } from './memory-io.js';
import { loadInputs, buildOutputs } from '../core/sync.js';
import { parseLayout } from '../core/layout.js';
import { MapCanvas } from '../plugin/map-canvas.js';
import { readTheme } from '../plugin/style.js';
import { renderPanel } from '../plugin/panel.js';

let mounts = 0;

function mount(el, { dataUrl, noteHref }) {
  installDomHelpers();
  const listId = `em-names-web-${++mounts}`;
  el.empty();
  el.addClass('em-view', 'em-web');
  const toolbarEl = el.createDiv('em-toolbar');
  const errorEl = el.createDiv('em-error is-hidden');
  const body = el.createDiv('em-body');
  const stage = body.createDiv('em-stage');
  const bgEl = stage.createDiv('em-background');
  const cyEl = stage.createDiv('em-canvas');
  const legendEl = stage.createDiv('em-legend');
  const panelEl = body.createDiv('em-panel is-hidden');

  let canvas = null;
  let inputs = null;
  let mentions = {};
  let destroyed = false;

  const showError = message => {
    errorEl.setText(`⚠ ${message}`);
    errorEl.removeClass('is-hidden');
  };
  const go = linktext => {
    const href = linktext && noteHref(linktext);
    if (href) window.location.href = href;
  };

  const hidePanel = () => {
    panelEl.empty();
    panelEl.addClass('is-hidden');
  };
  const showPanel = name => renderPanel(panelEl, name, {
    graph: canvas.graph,
    channelSources: inputs.channelSources,
    mentions: mentions[name] ?? [],
    select: n => canvas.find(n),
    openLink: go,
    close: () => canvas.clearSelection(),
  });

  const renderToolbar = () => {
    const { state } = canvas;
    toolbarEl.empty();
    const chip = (parent, label, on, onClick, title) => {
      const b = parent.createEl('button', { text: label, cls: `em-chip${on ? ' is-on' : ''}`, attr: title ? { 'aria-label': title } : {} });
      b.addEventListener('click', onClick);
    };
    const toggled = () => { canvas.applyVisibility(); renderToolbar(); };

    const layers = toolbarEl.createDiv('em-group');
    layers.createSpan({ text: 'Layers', cls: 'em-muted' });
    for (const [k, label] of [['beam', 'Beams'], ['rf', 'RF'], ['control', 'Control']]) {
      chip(layers, label, state.layers[k], () => { state.layers[k] = !state.layers[k]; toggled(); });
    }

    const show = toolbarEl.createDiv('em-group');
    show.createSpan({ text: 'Show', cls: 'em-muted' });
    const toggleIn = (set, x) => () => { if (set.has(x)) set.delete(x); else set.add(x); toggled(); };
    for (const x of canvas.knownExperiments) chip(show, x, state.experiments.has(x), toggleIn(state.experiments, x));
    for (const t of canvas.config.filter_tags) chip(show, t, !state.hiddenTags.has(t), toggleIn(state.hiddenTags, t));
    chip(show, 'Spare/retired', state.showRetired, () => { state.showRetired = !state.showRetired; toggled(); });

    const actions = toolbarEl.createDiv('em-group em-actions');
    const search = actions.createEl('input', { type: 'search', cls: 'em-search', attr: { placeholder: 'Find component…', list: listId } });
    const list = actions.createEl('datalist', { attr: { id: listId } });
    for (const n of Object.keys(canvas.graph.components)) list.createEl('option', { attr: { value: n } });
    search.addEventListener('change', () => canvas.find(search.value.trim()));
    chip(actions, 'Fit', false, () => canvas.fit(), 'Fit map to view');
  };

  // Quartz's dark mode switch changes the page's colours; Cytoscape needs them copied in again.
  const themeWatch = new MutationObserver(() => canvas?.setTheme(readTheme(el)));
  const resizeWatch = new ResizeObserver(() => {
    canvas?.resize();
    el.toggleClass('is-narrow', el.clientWidth < 700);
  });

  (async () => {
    let d;
    try {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`could not load the map data (HTTP ${res.status})`);
      d = await res.json();
      if (d.error) throw new Error(d.error);
      if (d.format !== 1) throw new Error(`map data format ${d.format} is not supported by this version of the web map`);
      inputs = await loadInputs(memoryIo(d), { configPath: d.configPath, offline: true });
    } catch (e) {
      if (!destroyed) showError(e.message);
      return;
    }
    if (destroyed) return;
    mentions = d.mentions ?? {};
    const { graph } = buildOutputs(inputs);
    const { config } = inputs;
    canvas = new MapCanvas({
      container: cyEl,
      legendEl,
      bgEl,
      theme: readTheme(el),
      onSelect: name => (name ? showPanel(name) : hidePanel()),
      onOpen: name => go(canvas.graph.components[name]?.path),
    });
    canvas.cy.autoungrabify(true);
    const flagged = new Set(graph.problems.map(p => p.subject).filter(Boolean));
    const positions = parseLayout(d.files[`${config.output_folder}/layout.json`] ?? null).positions;
    canvas.setData({ graph, config, positions, flagged });
    renderToolbar();
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['saved-theme', 'class', 'data-theme'] });
    resizeWatch.observe(el);
  })();

  return {
    destroy() {
      destroyed = true;
      themeWatch.disconnect();
      resizeWatch.disconnect();
      canvas?.destroy();
      canvas = null;
      el.empty();
    },
  };
}

window.ExperimentMap = { mount };
