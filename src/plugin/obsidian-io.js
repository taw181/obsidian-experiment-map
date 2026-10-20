import { normalizePath, requestUrl } from 'obsidian';
import { sortMentions } from '../core/mentions.js';

export function obsidianIo(app) {
  const adapter = app.vault.adapter;
  return {
    async readText(p) {
      const path = normalizePath(p);
      return (await adapter.exists(path)) ? adapter.read(path) : null;
    },
    async writeText(p, text) {
      const path = normalizePath(p);
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);
      await adapter.write(path, text);
    },
    async listMarkdown(folder) {
      const prefix = `${normalizePath(folder)}/`;
      const files = app.vault.getMarkdownFiles().filter(f => f.path.startsWith(prefix)).sort((a, b) => (a.path < b.path ? -1 : 1));
      return Promise.all(files.map(async f => ({ path: f.path, text: await app.vault.cachedRead(f) })));
    },
    async httpGetText(url) {
      const res = await requestUrl({ url, headers: { 'User-Agent': 'experiment-map' } });
      return res.text;
    },
  };
}

// Notes outside the map folder that link to `path`, newest first.
export function mentionsFor(app, path, excludeFolder) {
  const out = [];
  for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    if (source.startsWith(`${excludeFolder}/`)) continue;
    if (targets[path]) out.push(source);
  }
  return sortMentions(out);
}
