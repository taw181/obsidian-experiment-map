import { promises as fs } from 'node:fs';
import path from 'node:path';
import { LINK_TARGETS, linkName, linkLines, sortMentions } from '../core/mentions.js';

const SKIP = new Set(['node_modules']);

export async function walkMarkdown(root, folder) {
  const out = [];
  async function rec(rel) {
    let entries;
    try {
      entries = await fs.readdir(path.join(root, ...rel.split('/').filter(Boolean)), { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await rec(child);
      else if (e.isFile() && e.name.endsWith('.md')) out.push({ path: child, text: await fs.readFile(path.join(root, ...child.split('/')), 'utf8') });
    }
  }
  await rec(folder);
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export function nodeIo(root) {
  const abs = p => path.join(root, ...p.split('/'));
  return {
    async readText(p) {
      try {
        return await fs.readFile(abs(p), 'utf8');
      } catch (e) {
        if (e.code === 'ENOENT') return null;
        throw e;
      }
    },
    async writeText(p, text) {
      await fs.mkdir(path.dirname(abs(p)), { recursive: true });
      await fs.writeFile(abs(p), text, 'utf8');
    },
    listMarkdown: folder => walkMarkdown(root, folder),
    async httpGetText(url) {
      const res = await fetch(url, { headers: { 'User-Agent': 'experiment-map' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.text();
    },
  };
}

// Pages outside the map folder that link to each component, newest first.
export async function findMentions(root, names, excludeFolder) {
  const wanted = new Set(names);
  const out = {};
  for (const f of await walkMarkdown(root, '')) {
    if (f.path.startsWith(`${excludeFolder}/`)) continue;
    for (const m of f.text.matchAll(LINK_TARGETS)) {
      const target = linkName(m[1]);
      if (wanted.has(target)) (out[target] ??= []).push(f.path);
    }
  }
  for (const k of Object.keys(out)) out[k] = sortMentions(out[k]);
  return out;
}

// Pages outside the map folder that link to `name`, newest first, each with
// the lines that link: [{path, lines: [{line, segments}]}].
export async function findBacklinks(root, name, excludeFolder) {
  const pages = {};
  for (const f of await walkMarkdown(root, '')) {
    if (f.path.startsWith(`${excludeFolder}/`)) continue;
    const lines = linkLines(f.text, t => linkName(t) === name);
    if (lines.length) pages[f.path] = lines;
  }
  return sortMentions(Object.keys(pages)).map(path => ({ path, lines: pages[path] }));
}
