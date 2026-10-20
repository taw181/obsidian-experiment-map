import { Notice, normalizePath } from 'obsidian';
import { DEFAULT_CONFIG } from '../core/config.js';
import configTemplate from '../../templates/Config.md';
import readmeTemplate from '../../templates/README.md';

// "Set up this vault": the starter Config.md, the note folders and a how-to
// note. Creates only what is missing and never overwrites. Returns the paths it created.
export async function setupVault(plugin) {
  const adapter = plugin.app.vault.adapter;
  const configPath = normalizePath(plugin.settings.configPath);
  const dir = configPath.split('/').slice(0, -1).join('/');
  const created = [];
  const folder = async p => {
    if (!p || (await adapter.exists(p))) return;
    await adapter.mkdir(p);
    created.push(`${p}/`);
  };
  const file = async (p, text) => {
    if (await adapter.exists(p)) return;
    await adapter.write(p, text);
    created.push(p);
  };
  await folder(dir);
  await file(configPath, configTemplate);
  await folder(normalizePath(DEFAULT_CONFIG.components_folder));
  await folder(normalizePath(DEFAULT_CONFIG.models_folder));
  await file(normalizePath(dir ? `${dir}/README.md` : 'README.md'), readmeTemplate);
  new Notice(created.length ? `Experiment map: created ${created.join(', ')}` : 'Experiment map: this vault is already set up');
  try {
    await plugin.loadGraph();
  } catch (e) {
    console.error('experiment-map', e);
  }
  plugin.refreshViews();
  return created;
}
