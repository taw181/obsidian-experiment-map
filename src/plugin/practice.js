import { normalizePath } from 'obsidian';
import { PRACTICE_DIR, PRACTICE_CONFIG_PATH, practiceConfig } from '../core/guide.js';
import configTemplate from '../../templates/Config.md';
import { VIEW_TYPE } from './view.js';

// Empties the practice folder and writes a fresh Config.md and note folders.
// The previous run is only in git history after this.
export async function resetPractice(plugin) {
  const adapter = plugin.app.vault.adapter;
  if (plugin.layout.path?.startsWith(`${PRACTICE_DIR}/`)) plugin.layout.discard();
  // A map view showing the old practice map fits the new one when it has boxes.
  if (plugin.activeMap === 'practice') {
    for (const leaf of plugin.app.workspace.getLeavesOfType(VIEW_TYPE)) leaf.view.resetForMap?.();
  }
  // rmdir, not vault.delete: it also removes the hidden .hardware cache.
  if (await adapter.exists(PRACTICE_DIR)) await adapter.rmdir(PRACTICE_DIR, true);
  await adapter.mkdir(PRACTICE_DIR);
  await adapter.write(PRACTICE_CONFIG_PATH, practiceConfig(configTemplate));
  await adapter.mkdir(normalizePath(`${PRACTICE_DIR}/Components`));
  await adapter.mkdir(normalizePath(`${PRACTICE_DIR}/Models`));
}
