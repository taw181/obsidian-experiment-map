import { Modal, Setting, FuzzySuggestModal, Notice, normalizePath, stringifyYaml } from 'obsidian';
import { VIEW_TYPE } from './view.js';
import { templateProperties } from '../core/config.js';
import { asList } from '../core/wikilink.js';

const INVALID_NAME = /[\\/:#^[\]|*"<>?]/;
// Properties that describe one physical unit; "make model" leaves them on the component.
const UNIT_PROPERTIES = new Set(['beam_from', 'rf_from', 'control_from', 'location', 'output_location', 'status', 'experiment', 'address', 'model', 'tags', 'aliases', 'cssclasses']);

export function registerEditCommands(plugin) {
  plugin.newComponent = selected => newComponent(plugin, selected ?? null);
  plugin.addCommand({
    id: 'new-component',
    name: 'New component',
    callback: () => plugin.newComponent(plugin.app.workspace.getLeavesOfType(VIEW_TYPE)[0]?.view?.selected ?? null),
  });
  plugin.addCommand({ id: 'new-model', name: 'New model', callback: () => newModel(plugin) });
  plugin.addCommand({
    id: 'make-model',
    name: 'Make model from this component',
    checkCallback: checking => {
      const file = plugin.app.workspace.getActiveFile();
      const ok = Boolean(file && plugin.config && file.path.startsWith(`${plugin.config.components_folder}/`));
      if (ok && !checking) makeModelFrom(plugin, file);
      return ok;
    },
  });
}

async function current(plugin) {
  if (!plugin.graph) await plugin.loadGraph();
  return { graph: plugin.graph, config: plugin.config };
}

function checkName(name, graph) {
  if (!name) return 'Give it a name.';
  if (INVALID_NAME.test(name)) return 'Names cannot contain \\ / : # ^ [ ] | * " < > ?';
  if (graph.components[name] || graph.models[name]) return `A component or model called '${name}' already exists.`;
  return null;
}

async function createNote(app, path, frontmatter, body = '', open = true) {
  const folder = path.split('/').slice(0, -1).join('/');
  if (folder && !app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
  const file = await app.vault.create(path, `---\n${stringifyYaml(frontmatter)}---\n${body}`);
  if (open) await app.workspace.getLeaf('tab').openFile(file);
  return file;
}

class ChooseModal extends FuzzySuggestModal {
  constructor(app, items, placeholder, onChoose) {
    super(app);
    this.items = items;
    this.onChoose = onChoose;
    this.setPlaceholder(placeholder);
  }
  getItems() { return this.items; }
  getItemText(item) { return item.label; }
  onChooseItem(item) { this.onChoose(item); }
}

// fields: [{ key, label, value?, options?: string[], suggestions?: string[] }]
// onSubmit(values) returns an error message, or null to close.
class FormModal extends Modal {
  constructor(app, title, fields, onSubmit) {
    super(app);
    this.title = title;
    this.fields = fields;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    this.titleEl.setText(this.title);
    const values = {};
    for (const f of this.fields) {
      values[f.key] = f.value ?? '';
      const s = new Setting(this.contentEl).setName(f.label);
      if (f.options) {
        s.addDropdown(d => {
          for (const o of f.options) d.addOption(o, o || '(none)');
          d.setValue(values[f.key] || f.options[0]);
          values[f.key] = d.getValue();
          d.onChange(v => { values[f.key] = v; });
        });
      } else {
        s.addText(t => {
          t.setValue(values[f.key]);
          t.onChange(v => { values[f.key] = v; });
          if (f.suggestions?.length) {
            const id = `em-dl-${f.key}-${Math.random().toString(36).slice(2)}`;
            t.inputEl.setAttr('list', id);
            const dl = this.contentEl.createEl('datalist', { attr: { id } });
            for (const o of f.suggestions) dl.createEl('option', { attr: { value: o } });
          }
        });
      }
    }
    const error = this.contentEl.createDiv('em-form-error');
    new Setting(this.contentEl).addButton(b => b.setButtonText('Create').setCta().onClick(async () => {
      try {
        const msg = await this.onSubmit(values);
        if (msg) error.setText(msg);
        else this.close();
      } catch (e) {
        error.setText(e.message);
      }
    }));
  }

  onClose() {
    this.contentEl.empty();
  }
}

async function newComponent(plugin, selected) {
  const { graph, config } = await current(plugin);
  const models = Object.keys(graph.models).sort().map(name => ({ label: `${name}  (${graph.models[name].props.type ?? 'no type'})`, name }));
  new ChooseModal(plugin.app, [{ label: '(no model)', name: null }, ...models], 'Model for the new component', choice => {
    const model = choice.name ? graph.models[choice.name] : null;
    const sel = selected ? graph.components[selected] : null;
    const locations = [...new Set(Object.values(graph.components).map(c => c.props.location).filter(Boolean).map(String))].sort();
    const fields = [
      { key: 'name', label: 'Name' },
      { key: 'location', label: 'Location', value: sel?.props.location ? String(sel.props.location) : '', suggestions: locations },
    ];
    if (!model?.props.type) fields.push({ key: 'type', label: 'Type', options: Object.keys(config.types) });
    const modelType = model?.props.type;
    if (!model || config.types[modelType]?.source) fields.push({ key: 'experiment', label: 'Experiment (comma-separated; blank = inherit from upstream)' });
    const templates = Object.keys(config.templates ?? {}).sort();
    if (templates.length) fields.push({ key: 'template', label: 'Template (its properties are added blank, to fill in)', options: ['', ...templates] });

    new FormModal(plugin.app, 'New component', fields, async v => {
      const name = v.name.trim();
      const err = checkName(name, graph);
      if (err) return err;
      const type = modelType ?? v.type;
      const category = config.types[type]?.category;
      const fm = {};
      if (model) fm.model = `[[${model.name}]]`;
      if (!modelType) fm.type = type;
      const experiments = (v.experiment ?? '').split(',').map(s => s.trim()).filter(Boolean);
      if (experiments.length) fm.experiment = experiments;
      if (v.location.trim()) fm.location = v.location.trim();
      if (category === 'optical') {
        fm.beam_from = sel && sel.category === 'optical' ? [`[[${sel.name}]]`] : [];
        fm.rf_from = [];
      }
      fm.control_from = [];
      if (type === 'controller') fm.address = '';
      fm.manuals = [];
      for (const k of templateProperties(config, { type, template: v.template, modelProps: model?.props ?? {}, existing: Object.keys(fm) })) fm[k] = null;
      await createNote(plugin.app, normalizePath(`${config.components_folder}/${name}.md`), fm);
      return null;
    }).open();
  }).open();
}

async function newModel(plugin) {
  const { graph, config } = await current(plugin);
  new FormModal(plugin.app, 'New model', [
    { key: 'name', label: 'Name (the part number, or the kind of device)' },
    { key: 'type', label: 'Type', options: Object.keys(config.types) },
    { key: 'parent', label: 'Extends', options: ['', ...Object.keys(graph.models).sort()] },
  ], async v => {
    const name = v.name.trim();
    const err = checkName(name, graph);
    if (err) return err;
    const fm = {};
    if (v.parent) fm.extends = `[[${v.parent}]]`;
    fm.type = v.type;
    fm.manuals = [];
    await createNote(plugin.app, normalizePath(`${config.models_folder}/${name}.md`), fm, '\nNotes that apply to every unit of this model.\n');
    return null;
  }).open();
}

async function makeModelFrom(plugin, file) {
  const { graph, config } = await current(plugin);
  const app = plugin.app;
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  new FormModal(app, `Make model from ${file.basename}`, [{ key: 'name', label: 'Model name' }], async v => {
    const name = v.name.trim();
    const err = checkName(name, graph);
    if (err) return err;
    const moved = {};
    const unit = new Set([...UNIT_PROPERTIES, ...asList(config.unit_properties).map(String)]);
    const blank = val => val === null || val === undefined || val === '' || (Array.isArray(val) && val.length === 0);
    for (const [k, val] of Object.entries(fm)) if (!unit.has(k) && !blank(val)) moved[k] = val;
    if (!Object.keys(moved).length) return 'Nothing to move: this note only has connections, location, status, experiment, per-unit properties and blank ones.';
    const modelFm = {};
    if (fm.model) modelFm.extends = fm.model;
    Object.assign(modelFm, moved);
    await createNote(app, normalizePath(`${config.models_folder}/${name}.md`), modelFm, '', false);
    await app.fileManager.processFrontMatter(file, f => {
      for (const k of Object.keys(moved)) delete f[k];
      f.model = `[[${name}]]`;
    });
    new Notice(`Moved ${Object.keys(moved).join(', ')} to ${name}`);
    return null;
  }).open();
}
