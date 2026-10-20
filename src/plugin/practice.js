import { normalizePath } from 'obsidian';
import { PRACTICE_DIR, PRACTICE_CONFIG_PATH, practiceConfig } from '../core/guide.js';
import configTemplate from '../../templates/Config.md';

// Empties the practice folder and writes a fresh Config.md and note folders.
// The previous run is only in git history after this.
export async function resetPractice(plugin) {
  const adapter = plugin.app.vault.adapter;
  if (plugin.layout.path?.startsWith(`${PRACTICE_DIR}/`)) plugin.layout.discard();
  // rmdir, not vault.delete: it also removes the hidden .hardware cache.
  if (await adapter.exists(PRACTICE_DIR)) await adapter.rmdir(PRACTICE_DIR, true);
  await adapter.mkdir(PRACTICE_DIR);
  await adapter.write(PRACTICE_CONFIG_PATH, practiceConfig(configTemplate));
  await adapter.mkdir(normalizePath(`${PRACTICE_DIR}/Components`));
  await adapter.mkdir(normalizePath(`${PRACTICE_DIR}/Models`));
}
