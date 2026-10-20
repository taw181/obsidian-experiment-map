import { Plugin, Notice } from 'obsidian';
import { MapView, VIEW_TYPE } from './view.js';
import { obsidianIo } from './obsidian-io.js';
import { LayoutStore } from './layout-store.js';
import { registerEditCommands } from './commands.js';
import { setupVault } from './setup.js';
import { sync, loadInputs, buildOutputs, DEFAULT_CONFIG_PATH } from '../core/sync.js';
import { noteName } from '../core/notes.js';
import { layoutKeys, legacyLayoutKeys } from './elements.js';
import { PRACTICE_CONFIG_PATH } from '../core/guide.js';
import { loadLocal, saveLocal } from './local.js';

const DEFAULT_SETTINGS = { configPath: DEFAULT_CONFIG_PATH };

export default class ExperimentMapPlugin extends Plugin {
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
    this.io = obsidianIo(this.app);
    this.layout = new LayoutStore(this.app);
    this.config = null;
    this.graph = null;
    this.channelSources = {};
    this.syncing = null;
    this.shownNotices = new Set();
    // 'real' or 'practice': which map the view and the commands work on.
    this.activeMap = loadLocal(this.app, 'activeMap') === 'practice' ? 'practice' : 'real';
    this.hasPractice = false;

    this.registerView(VIEW_TYPE, leaf => new MapView(leaf, this));
    this.addRibbonIcon('map', 'Open experiment map', () => this.openMap());
    this.addCommand({ id: 'open', name: 'Open', callback: () => this.openMap() });
    this.addCommand({ id: 'sync', name: 'Sync', callback: () => this.sync() });
    this.addCommand({ id: 'setup-vault', name: 'Set up this vault', callback: () => setupVault(this) });
    registerEditCommands(this);

    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onRename(file, oldPath)));
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file.path === this.layout.path) this.layout.load().then(() => this.refreshViews());
    }));
    this.app.workspace.onLayoutReady(() => this.loadGraph().catch(e => { if (!e.missing) console.error('experiment-map', e); }));
  }

  configPath() {
    return this.activeMap === 'practice' ? PRACTICE_CONFIG_PATH : this.settings.configPath;
  }

  async loadGraph() {
    this.hasPractice = await this.app.vault.adapter.exists(PRACTICE_CONFIG_PATH);
    // The practice folder went away (a pull, a delete): back to the real map.
    if (this.activeMap === 'practice' && !this.hasPractice) this.setActiveMap('real');
    const inputs = await loadInputs(this.io, { configPath: this.configPath(), offline: true });
    const { graph } = buildOutputs(inputs);
    this.config = inputs.config;
    this.channelSources = inputs.channelSources;
    this.graph = graph;
    this.layout.setPath(`${inputs.config.output_folder}/layout.json`);
    this.layout.setKeep(layoutKeys(graph, inputs.config), legacyLayoutKeys(graph, inputs.config));
    if (!this.layout.loaded) await this.layout.load();
    return { config: inputs.config, graph, notices: inputs.notices };
  }

  sync({ quiet = false } = {}) {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      try {
        const r = await sync(this.io, { configPath: this.configPath() });
        // When the view syncs by itself, repeat a notice (e.g. GitHub rate limit) only once per session.
        for (const n of r.notices) {
          if (quiet) this.noticeOnce(`Experiment map: ${n}`);
          else new Notice(`Experiment map: ${n}`, 8000);
        }
        if (!quiet || r.written.length) {
          const what = r.written.length ? `updated ${r.written.length} file${r.written.length === 1 ? '' : 's'}` : 'up to date';
          new Notice(`Experiment map: ${what}, ${r.graph.problems.length} problem${r.graph.problems.length === 1 ? '' : 's'}`);
        }
        this.refreshViews();
      } catch (e) {
        // A vault with no map yet: the view says so; a background sync needn't.
        if (quiet && e.missing) return;
        console.error('experiment-map sync', e);
        new Notice(`Experiment map: sync failed (${e.message})`);
      } finally {
        this.syncing = null;
      }
    })();
    return this.syncing;
  }

  setActiveMap(which) {
    this.activeMap = which;
    saveLocal(this.app, 'activeMap', which);
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view.resetForMap?.();
  }

  // Shows the real or the practice map, saving any pending layout first so a
  // drag just before the switch lands in the map it was made on.
  async showMap(which) {
    if (which !== this.activeMap) {
      await this.layout.flush();
      this.setActiveMap(which);
      this.refreshViews();
    }
    await this.openMap();
  }

  noticeOnce(text) {
    if (this.shownNotices.has(text)) return;
    this.shownNotices.add(text);
    new Notice(text, 8000);
  }

  refreshViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view.scheduleRefresh?.(0);
  }

  async openMap() {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
    if (existing) {
      this.app.workspace.revealLeaf(existing);
      return;
    }
    await this.app.workspace.getLeaf('tab').setViewState({ type: VIEW_TYPE, active: true });
  }

  onRename(file, oldPath) {
    const folder = this.config ? `${this.config.components_folder}/` : null;
    if (folder && oldPath.startsWith(folder) && file.path.startsWith(folder)) this.layout.rename(noteName(oldPath), noteName(file.path));
  }
}
