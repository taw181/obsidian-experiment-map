import { Component, ItemView, MarkdownRenderer, Modal, Setting } from 'obsidian';
import { loadInputs, buildOutputs } from '../core/sync.js';
import { STEPS, PRACTICE_DIR, PRACTICE_CONFIG_PATH, advance, currentStep, isFinished, isTaskDone, missingCreated, hintsFor } from '../core/guide.js';
import { resetPractice } from './practice.js';
import { loadLocal, saveLocal } from './local.js';

export const GUIDE_VIEW_TYPE = 'experiment-map-guide';

class ChoiceModal extends Modal {
  // buttons: [{ label, cta?, onClick }]
  constructor(app, title, text, buttons) {
    super(app);
    this.title = title;
    this.text = text;
    this.buttons = buttons;
  }

  onOpen() {
    this.titleEl.setText(this.title);
    this.contentEl.createEl('p', { text: this.text });
    const s = new Setting(this.contentEl);
    for (const b of this.buttons) {
      s.addButton(btn => {
        btn.setButtonText(b.label).onClick(() => { this.close(); b.onClick(); });
        if (b.cta) btn.setCta();
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

export async function openGuide(plugin) {
  const ws = plugin.app.workspace;
  let leaf = ws.getLeavesOfType(GUIDE_VIEW_TYPE)[0];
  if (!leaf) {
    leaf = ws.getRightLeaf(false);
    await leaf.setViewState({ type: GUIDE_VIEW_TYPE, active: true });
  }
  ws.revealLeaf(leaf);
}

async function begin(plugin, reset) {
  if (reset) {
    await resetPractice(plugin);
    saveLocal(plugin.app, 'guide', { done: [] });
  }
  await plugin.showMap('practice');
  plugin.refreshViews();
  await openGuide(plugin);
  for (const leaf of plugin.app.workspace.getLeavesOfType(GUIDE_VIEW_TYPE)) leaf.view.scheduleRefresh?.(0);
}

// "Start getting started guide": continue a run in progress on this machine,
// or reset the practice map (asking first if it has anything in it).
export async function startGuide(plugin) {
  const app = plugin.app;
  const progress = loadLocal(app, 'guide');
  const exists = await app.vault.adapter.exists(PRACTICE_DIR);
  if (progress && !isFinished(progress) && exists) {
    new ChoiceModal(app, 'Getting started guide', 'You have a practice run in progress on this computer.', [
      { label: 'Continue where you left off', cta: true, onClick: () => begin(plugin, false) },
      { label: 'Start over', onClick: () => begin(plugin, true) },
    ]).open();
  } else if (exists) {
    new ChoiceModal(app, 'Reset the practice map?', `This deletes everything in "${PRACTICE_DIR}" (it stays in git history, if the vault uses git) and starts the guide from step 1.`, [
      { label: 'Reset and start', cta: true, onClick: () => begin(plugin, true) },
      { label: 'Cancel', onClick: () => {} },
    ]).open();
  } else {
    await begin(plugin, true);
  }
}

// The right-sidebar panel: the six steps, ticked from the practice notes.
export class GuideView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.timer = null;
    this.renders = 0;
    // Owns the rendered Markdown of the panel on screen; replaced on each refresh.
    this.shown = null;
  }

  getViewType() { return GUIDE_VIEW_TYPE; }
  getDisplayText() { return 'Getting started'; }
  getIcon() { return 'graduation-cap'; }

  async onOpen() {
    this.contentEl.addClass('em-guide');
    const inPractice = p => typeof p === 'string' && p.startsWith(`${PRACTICE_DIR}/`);
    const onChange = file => { if (inPractice(file.path)) this.scheduleRefresh(); };
    this.registerEvent(this.app.metadataCache.on('changed', onChange));
    this.registerEvent(this.app.vault.on('create', onChange));
    this.registerEvent(this.app.vault.on('delete', onChange));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      if (inPractice(file.path) || inPractice(oldPath)) this.scheduleRefresh();
    }));
    await this.refresh();
  }

  async onClose() {
    clearTimeout(this.timer);
  }

  scheduleRefresh(delay = 300) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), delay);
  }

  async loadPractice() {
    try {
      return buildOutputs(await loadInputs(this.plugin.io, { configPath: PRACTICE_CONFIG_PATH, offline: true })).graph;
    } catch (e) {
      if (!e.missing) console.error('experiment-map guide', e);
      return null;
    }
  }

  // Builds the panel off-screen, then swaps it in, so overlapping refreshes
  // never interleave their output.
  async refresh() {
    const id = ++this.renders;
    const graph = await this.loadPractice();
    if (id !== this.renders) return;
    // Each refresh's Markdown belongs to its own child component, unloaded
    // when a later refresh replaces it.
    const owner = this.addChild(new Component());
    const md = (el, text) => MarkdownRenderer.render(this.app, text, el, PRACTICE_CONFIG_PATH, owner);
    let progress = loadLocal(this.app, 'guide');
    const root = createDiv();
    root.createEl('h4', { text: 'Getting started', cls: 'em-guide-title' });

    if (!graph || !progress) {
      root.createEl('p', { text: 'Build a small practice map, step by step, to learn how the experiment map works. It goes in its own folder and never touches your lab\'s map.' });
      this.button(root, 'Start', () => startGuide(this.plugin), true);
      return this.swap(id, root, owner);
    }

    const missing = missingCreated(progress, graph);
    if (missing.length) {
      root.createEl('p', { cls: 'em-guide-hint', text: `The practice map has changed since you started (someone may have reset it): ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} gone.` });
      this.button(root, 'Start over', () => begin(this.plugin, true), true);
      return this.swap(id, root, owner);
    }

    const next = advance(progress, graph);
    if (next.done.length !== progress.done.length) {
      saveLocal(this.app, 'guide', next);
      progress = next;
    }
    const cur = currentStep(progress);
    const status = root.createDiv('em-guide-status');
    status.appendText(cur < STEPS.length ? `Practice map · step ${cur + 1} of ${STEPS.length} · ` : 'Practice map · finished · ');
    const show = status.createEl('a', { text: 'show practice map', href: '#' });
    show.addEventListener('click', ev => { ev.preventDefault(); this.plugin.showMap('practice'); });

    const renders = [];
    for (const [i, step] of STEPS.entries()) {
      if (i !== cur) {
        root.createDiv({ cls: `em-guide-step ${i < cur ? 'is-done' : 'is-later'}`, text: `${i < cur ? '✓ ' : ''}${i + 1} · ${step.title}` });
        continue;
      }
      const box = root.createDiv('em-guide-current');
      box.createEl('h5', { text: `${i + 1} · ${step.title}` });
      box.createDiv({ cls: 'em-guide-label', text: 'Do' });
      for (const task of step.tasks) {
        const done = isTaskDone(progress, step, task);
        const row = box.createDiv(`em-guide-task${done ? ' is-done' : ''}`);
        row.createSpan({ cls: 'em-guide-mark', text: done ? '✓' : '☐' });
        const body = row.createDiv('em-guide-text');
        body.createDiv({ cls: 'em-guide-task-head', text: task.heading });
        renders.push(md(body.createDiv(), task.text));
      }
      box.createDiv({ cls: 'em-guide-label', text: 'Why' });
      renders.push(md(box.createDiv('em-guide-text'), step.why));
      box.createDiv({ cls: 'em-guide-label', text: 'Look for' });
      renders.push(md(box.createDiv('em-guide-text'), step.lookFor));
      for (const h of hintsFor(i, graph)) renders.push(md(box.createDiv('em-guide-hint'), `⚠ ${h}`));
    }
    if (cur === STEPS.length) await this.renderFinished(root, renders, md);
    await Promise.all(renders);
    this.swap(id, root, owner);
  }

  async renderFinished(root, renders, md) {
    const box = root.createDiv('em-guide-current');
    box.createEl('h5', { text: 'Done!' });
    renders.push(md(box.createDiv('em-guide-text'), "You've built the whole practice map: a laser feeding a chamber on another table through an AOM and a fibre, the VCO, control board and PC that drive the AOM, and a model for the AOM."));
    const configPath = this.plugin.settings.configPath;
    const dir = configPath.split('/').slice(0, -1).join('/');
    const p = box.createEl('p');
    if (await this.app.vault.adapter.exists(configPath)) {
      p.appendText(`Your lab's map is in "${dir || '/'}". `);
      const readme = dir ? `${dir}/README.md` : 'README.md';
      if (await this.app.vault.adapter.exists(readme)) {
        const a = p.createEl('a', { text: 'Open the how-to note', href: '#' });
        a.addEventListener('click', ev => { ev.preventDefault(); this.app.workspace.openLinkText(readme, '', 'tab'); });
        p.appendText(' for every property.');
      }
    } else {
      p.appendText('Run "Experiment map: Set up this vault" to start your own map.');
    }
    box.createEl('p', { text: 'The practice map stays as a reference: use the Practice switch in the map\'s toolbar to look at it again.' });
  }

  button(parent, label, onClick, cta = false) {
    const b = parent.createEl('button', { text: label, cls: cta ? 'mod-cta' : '' });
    b.addEventListener('click', onClick);
  }

  swap(id, root, owner) {
    if (id !== this.renders) {
      this.removeChild(owner);
      return;
    }
    if (this.shown) this.removeChild(this.shown);
    this.shown = owner;
    this.contentEl.empty();
    this.contentEl.appendChild(root);
  }
}
