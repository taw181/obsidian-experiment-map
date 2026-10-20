// Collect the release assets into a flat dist/: what the install scripts
// download and the release workflow uploads. Run after the build.
import { promises as fs } from 'node:fs';

const ASSETS = {
  'main.js': 'main.js',
  'manifest.json': 'manifest.json',
  'styles.css': 'styles.css',
  'cli.js': 'cli.js',
  'SKILL.md': 'skill/SKILL.md',
  'CLAUDE-snippet.md': 'skill/CLAUDE-snippet.md',
  'install.sh': 'install/install.sh',
  'install.ps1': 'install/install.ps1',
};

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
if (missing.length) {
  console.error(`dist: missing ${missing.join(', ')} (run npm run build first?)`);
  process.exit(1);
}
console.log(`dist: ${Object.keys(ASSETS).length} files`);
