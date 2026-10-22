import path from 'node:path';
import { nodeIo, findMentions, findBacklinks } from './node-io.js';
import { sync, check, loadInputs, buildOutputs, DEFAULT_CONFIG_PATH, ConfigError } from '../core/sync.js';
import { formatTrace, upstream, downstream } from '../core/trace.js';
import { formatFind, formatChannels, noteExcerpt } from '../core/query.js';
import { linkTypes } from '../core/config.js';

const USAGE = `usage: node .obsidian/plugins/experiment-map/cli.js [--vault DIR] [--config PATH] <command>

commands:
  sync [--offline]    fetch the channel sources, regenerate map.yaml, channel pages and Sync report.md
  check               exit 1 if any generated file is stale; print problems
  trace NAME          what feeds NAME (beam, rf, control), with lab book pages
  trace --down NAME   what NAME feeds or drives
  trace --notes NAME  the same, with the start of each note on the chain
  backlinks NAME      every page outside the map folder linking to component or
                      model NAME, newest first, with the lines that link
  find [FILTER ...]   components matching every filter, one line each
  channels [FILTER ...] [--unused]
                      control channels matching every filter, one line each

A FILTER is key=value (exact) or key~text (contains), ignoring case; a bare word
is name~word. Keys are those in map.yaml: any component property, plus note,
model, beam_from, rf_from, control_from, feeds, drives; for channels experiment,
name, address, board, kind, unit, comment, disabled, source, used_by and any
extra key the channel source adds.
  find type=aom location~"laser table"      find drives~cooling      find status=spare
  channels board=Dev1 --unused              channels address~port0/line3

--vault defaults to the current directory (the vault root).
`;

function parseArgs(argv) {
  const opts = { vault: process.cwd(), configPath: DEFAULT_CONFIG_PATH, offline: false, down: false, notes: false, unused: false, help: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--vault') opts.vault = path.resolve(argv[++i]);
    else if (a === '--config') opts.configPath = argv[++i];
    else if (a === '--offline') opts.offline = true;
    else if (a === '--down') opts.down = true;
    else if (a === '--notes') opts.notes = true;
    else if (a === '--unused') opts.unused = true;
    else if (a === '-h' || a === '--help') opts.help = true;
    else opts.rest.push(a);
  }
  return opts;
}

function printProblems(problems) {
  if (!problems.length) {
    console.log('No problems.');
    return;
  }
  console.log(`${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.log(`  - ${p.subject ? `${p.subject}: ` : ''}${p.message}`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [command, ...args] = opts.rest;
  if (opts.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!command) {
    process.stderr.write(USAGE);
    return 2;
  }
  const io = nodeIo(opts.vault);

  if (command === 'sync') {
    const r = await sync(io, { configPath: opts.configPath, offline: opts.offline });
    for (const n of r.notices) console.log(`note: ${n}`);
    console.log(r.written.length ? `updated: ${r.written.join(', ')}` : 'generated files already up to date');
    printProblems(r.graph.problems);
    return 0;
  }

  if (command === 'check') {
    const r = await check(io, { configPath: opts.configPath });
    for (const n of r.notices) console.log(`note: ${n}`);
    if (r.stale.length) console.log(`stale: ${r.stale.join(', ')}\nrun: node .obsidian/plugins/experiment-map/cli.js sync`);
    else console.log('generated files are up to date');
    printProblems(r.graph.problems);
    return r.stale.length ? 1 : 0;
  }

  if (command === 'trace') {
    const name = args.join(' ').trim();
    if (!name) {
      process.stderr.write(USAGE);
      return 2;
    }
    const inputs = await loadInputs(io, { configPath: opts.configPath, offline: true });
    const { graph } = buildOutputs(inputs);
    if (!graph.components[name]) {
      console.error(`no component named '${name}'`);
      const close = Object.keys(graph.components).filter(n => n.toLowerCase().includes(name.toLowerCase()));
      if (close.length) console.error(`did you mean: ${close.join(', ')}`);
      return 1;
    }
    const mentions = await findMentions(opts.vault, Object.keys(graph.components), inputs.config.output_folder);
    const excerpts = {};
    if (opts.notes) {
      for (const n of (opts.down ? downstream : upstream)(graph, name)) {
        const text = await io.readText(graph.components[n].path);
        const e = text === null ? null : noteExcerpt(text);
        if (e) excerpts[n] = e;
      }
    }
    const componentsFolder = inputs.config.components_folder;
    console.log(formatTrace(graph, name, { direction: opts.down ? 'down' : 'up', mentions, componentsFolder, excerpts, linkTypes: linkTypes(inputs.config) }));
    return 0;
  }

  if (command === 'backlinks') {
    const name = args.join(' ').trim();
    if (!name) {
      process.stderr.write(USAGE);
      return 2;
    }
    const inputs = await loadInputs(io, { configPath: opts.configPath, offline: true });
    const { graph } = buildOutputs(inputs);
    if (!graph.components[name] && !graph.models[name]) {
      console.error(`no component or model named '${name}'`);
      const close = [...Object.keys(graph.components), ...Object.keys(graph.models)].filter(n => n.toLowerCase().includes(name.toLowerCase()));
      if (close.length) console.error(`did you mean: ${close.join(', ')}`);
      return 1;
    }
    const pages = await findBacklinks(opts.vault, name, inputs.config.output_folder);
    if (!pages.length) console.log(`no pages link to ${name}`);
    for (const p of pages) {
      console.log(p.path);
      for (const l of p.lines) console.log(`  ${l.line + 1}: ${l.segments.map(s => s.text).join('')}`);
    }
    return 0;
  }

  if (command === 'find' || command === 'channels') {
    const inputs = await loadInputs(io, { configPath: opts.configPath, offline: true });
    const { graph } = buildOutputs(inputs);
    console.log(command === 'find'
      ? formatFind(graph, inputs.config, args)
      : formatChannels(graph, args, { unused: opts.unused }));
    return 0;
  }

  process.stderr.write(`unknown command '${command}'\n${USAGE}`);
  return 2;
}

main().then(
  code => { process.exitCode = code; },
  err => {
    if (err instanceof ConfigError) console.error(`error: ${err.message}`);
    else console.error(err.stack || String(err));
    process.exitCode = 3;
  },
);
