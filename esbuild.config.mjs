import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const common = { bundle: true, format: 'cjs', target: 'es2020', logLevel: 'info', legalComments: 'none' };
const builds = [
  { ...common, entryPoints: ['src/plugin/main.js'], outfile: 'main.js', platform: 'browser', external: ['obsidian', 'electron'], loader: { '.md': 'text' } },
  { ...common, entryPoints: ['src/cli/cli.js'], outfile: 'cli.js', platform: 'node', banner: { js: '#!/usr/bin/env node' } },
];

if (watch) {
  for (const b of builds) await (await esbuild.context(b)).watch();
} else {
  await Promise.all(builds.map(b => esbuild.build(b)));
}
