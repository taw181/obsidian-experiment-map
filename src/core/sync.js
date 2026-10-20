import { parseNote } from './notes.js';
import { resolveConfig } from './config.js';
import { loadSourceScript, cleanParse, EMPTY_PARSE } from './channels.js';
import { buildGraph } from './graph.js';
import { renderMapYaml, renderChannelPage, renderSyncReport } from './emit.js';

export const DEFAULT_CONFIG_PATH = 'Experiment map/Config.md';

// What a channel source fetched, kept so offline syncs and `check` can parse it.
export function channelCachePath(config, src) {
  return `${config.output_folder}/.hardware/${src.experiment}.txt`;
}

// Git on Windows may check text files out with CRLF; compare and parse as LF so
// every machine sees the same content.
const lf = s => (s === null || s === undefined ? s : s.replace(/\r\n?/g, '\n'));

export class ConfigError extends Error {
  constructor(message, { missing = false } = {}) {
    super(message);
    this.missing = missing;
  }
}

async function readLf(io, path) {
  return lf(await io.readText(path));
}

async function writeIfChanged(io, path, text) {
  if ((await readLf(io, path)) === text) return false;
  await io.writeText(path, text);
  return true;
}

async function readJson(io, path) {
  try {
    return JSON.parse((await io.readText(path)) ?? 'null');
  } catch {
    return null;
  }
}

const str = v => (v === null || v === undefined || v === '' ? null : String(v));

// Run one channel source: fetch (online, or always for a `local` source),
// else fall back to the cached copy; then parse. Errors become notices and
// `error`, never exceptions, so one bad script can't stop the map.
async function loadChannelSource(io, config, src, offline, notices) {
  const out = { experiment: src.experiment, page: src.channel_page, script: src.script ?? null, label: src.channel_page, version: null, url: null, missing: true, error: null, parsed: EMPTY_PARSE };
  let script = null;
  if (!src.script) out.error = `channel source '${src.experiment}' has no script`;
  else {
    const scriptText = await readLf(io, src.script);
    if (scriptText === null) out.error = `${src.script} not found`;
    else {
      try {
        script = loadSourceScript(scriptText, src.script);
      } catch (e) {
        out.error = e.message;
      }
    }
  }

  const local = src.local === true;
  const cache = channelCachePath(config, src);
  const cachedText = local ? null : await readLf(io, cache);
  const cachedMeta = local ? null : await readJson(io, `${cache}.json`);
  let text = null;
  let meta = null;
  let fetchFailed = null;
  if (script && (!offline || local)) {
    try {
      const f = await script.fetch(src.options ?? {}, { httpGetText: io.httpGetText, readText: p => io.readText(p) });
      text = lf(String(f?.text ?? ''));
      // An unchanged text keeps the version it was first fetched at, so the
      // generated files (and their source links) only change when it does.
      const same = text === cachedText && cachedMeta?.version;
      meta = { version: same ? cachedMeta.version : str(f?.version), url: same ? str(cachedMeta.url) : str(f?.url), label: str(f?.label) ?? src.channel_page };
      if (!local) {
        await writeIfChanged(io, cache, text);
        await writeIfChanged(io, `${cache}.json`, `${JSON.stringify(meta, null, 2)}\n`);
      }
    } catch (e) {
      fetchFailed = e.message;
      text = null;
    }
  }
  // A local source has no cache to fall back on: its failure is the script's
  // error, so the page is kept and one problem names it.
  if (fetchFailed !== null && local) out.error = `${src.script}: fetch failed (${fetchFailed})`;
  else if (fetchFailed !== null) {
    notices.push(cachedText === null
      ? `could not fetch channels for '${src.experiment}' (${fetchFailed}), and there is no earlier copy`
      : `could not fetch channels for '${src.experiment}' (${fetchFailed}); using the last copy`);
  }
  if (text === null && !local) {
    text = cachedText;
    meta = cachedMeta && { version: str(cachedMeta.version), url: str(cachedMeta.url), label: str(cachedMeta.label) ?? src.channel_page };
  }
  if (meta) Object.assign(out, meta);
  if (text !== null) {
    out.missing = false;
    if (script) {
      try {
        const parsed = script.parse(text, { options: src.options ?? {}, version: out.version, url: out.url });
        if (parsed && typeof parsed.then === 'function') throw new Error('parse must return its result, not a Promise (don\'t make it async)');
        out.parsed = cleanParse(parsed);
      } catch (e) {
        out.error = `${src.script}: ${e.message}`;
      }
    }
  } else if (!out.error && fetchFailed === null) {
    notices.push(`no copy of the channels for '${src.experiment}' yet; run sync while online`);
  }
  if (out.error) notices.push(`channel source '${src.experiment}': ${out.error}`);
  return out;
}

export async function loadInputs(io, { configPath = DEFAULT_CONFIG_PATH, offline = true } = {}) {
  const notices = [];
  // Without a readable config the channel source list is empty, and a sync would
  // replace everyone's channel pages and map.yaml with empty ones. Refuse.
  const configText = await readLf(io, configPath);
  if (configText === null) throw new ConfigError(`${configPath} not found; nothing was read or written`, { missing: true });
  const configNote = parseNote(configPath, configText);
  if (configNote.error) throw new ConfigError(`${configPath}: ${configNote.error}; fix it before syncing (nothing was written)`);
  const config = resolveConfig(configNote.frontmatter);

  if (config.legacyHardware) notices.push(`${configPath}: 'hardware:' is now 'channel_sources:' (see the README); no channels were read`);
  const channelSources = {};
  for (const src of config.channel_sources) {
    if (channelSources[src.experiment]) {
      notices.push(`${configPath}: two channel sources for experiment '${src.experiment}'; using the first`);
      continue;
    }
    channelSources[src.experiment] = await loadChannelSource(io, config, src, offline, notices);
  }

  const components = (await io.listMarkdown(config.components_folder)).map(f => parseNote(f.path, lf(f.text)));
  const models = (await io.listMarkdown(config.models_folder)).map(f => parseNote(f.path, lf(f.text)));
  return { config, channelSources, components, models, notices };
}

export function buildOutputs(inputs) {
  const graph = buildGraph(inputs);
  const { config, channelSources } = inputs;
  const files = {
    [`${config.output_folder}/map.yaml`]: renderMapYaml(graph),
    [`${config.output_folder}/Sync report.md`]: renderSyncReport(graph),
  };
  // A source whose script failed keeps its last page: better stale than empty.
  for (const [exp, src] of Object.entries(channelSources)) {
    if (!src.error) files[`${config.channels_folder}/${src.page}.md`] = renderChannelPage(exp, src, graph);
  }
  return { graph, files };
}

export async function sync(io, { configPath = DEFAULT_CONFIG_PATH, offline = false } = {}) {
  const inputs = await loadInputs(io, { configPath, offline });
  const { graph, files } = buildOutputs(inputs);
  const written = [];
  for (const [path, text] of Object.entries(files)) if (await writeIfChanged(io, path, text)) written.push(path);
  return { graph, written, notices: inputs.notices, config: inputs.config };
}

export async function check(io, { configPath = DEFAULT_CONFIG_PATH } = {}) {
  const inputs = await loadInputs(io, { configPath, offline: true });
  const { graph, files } = buildOutputs(inputs);
  const stale = [];
  for (const [path, text] of Object.entries(files)) if ((await readLf(io, path)) !== text) stale.push(path);
  return { graph, stale, notices: inputs.notices };
}
