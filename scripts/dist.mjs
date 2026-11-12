// Collect the release assets into a flat dist/: what the install scripts
// download and the release workflow uploads. Run after the build.
import { promises as fs } from 'node:fs';

const ASSETS = {
  'main.js': 'main.js',
  'manifest.json': 'manifest.json',
  'styles.css': 'styles.css',
  'cli.js': 'cli.js',
  'web.js': 'web.js',
  'SKILL.md': 'skill/experiment-map/SKILL.md',
  'SKILL-internals.md': 'skill/experiment-map-internals/SKILL.md',
  'CLAUDE-snippet.md': 'skill/CLAUDE-snippet.md',
  'install.sh': 'install/install.sh',
  'install.ps1': 'install/install.ps1',
};

const REPO = 'https://github.com/taw181/obsidian-experiment-map';

await fs.rm('dist', { recursive: true, force: true });
await fs.mkdir('dist');
const missing = [];
for (const [name, from] of Object.entries(ASSETS)) {
  try {
    await fs.copyFile(from, `dist/${name}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    missing.push(from);
  }
}
// design.md is the internals skill's reference. In a vault its links to
// other repo files can't resolve, so they point at the repo at this release.
try {
  const { version } = JSON.parse(await fs.readFile('manifest.json', 'utf8'));
  const text = await fs.readFile('docs/design.md', 'utf8');
  await fs.writeFile('dist/design.md', text.replaceAll('](../', `](${REPO}/blob/${version}/`));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  missing.push('docs/design.md');
}
// web.css: the plugin's styles plus the theme mapping the web map needs.
try {
  const css = await Promise.all(['styles.css', 'src/web/web.css'].map(f => fs.readFile(f, 'utf8')));
  await fs.writeFile('dist/web.css', css.join('\n'));
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  missing.push('web.css sources');
}
if (missing.length) {
  console.error(`dist: missing ${missing.join(', ')} (run npm run build first?)`);
  process.exit(1);
}
console.log(`dist: ${Object.keys(ASSETS).length + 2} files`);
