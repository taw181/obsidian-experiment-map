// Channel sources: vault scripts, named under channel_sources in Config.md,
// that list a lab's control channels (name, address, board, ...). The plugin
// knows nothing about where channels come from; a script does. It is plain
// JavaScript with no require/import, run the same way in Obsidian and in Node.
//
//   fetch(options, {httpGetText, readText}) -> {text, version, url, label}   (may be async)
//   parse(text, {options, version, url})    -> {channels, boards, appendix}  (synchronous)
//
// A channel: {name, kind, address, unresolved?, board, comment, disabled: [reason],
// source: {label, url}, extra: {key: value}}. A name may appear more than once.

export function normAddress(s) {
  return String(s).replace(/\s+/g, '').replace(/^\/+/, '');
}

export function loadSourceScript(text, path) {
  const mod = { exports: {} };
  try {
    new Function('module', 'exports', text)(mod, mod.exports);
  } catch (e) {
    throw new Error(`${path}: ${e.message}`);
  }
  const s = mod.exports;
  if (!s || typeof s.fetch !== 'function') throw new Error(`${path}: does not export fetch(options, tools)`);
  if (typeof s.parse !== 'function') throw new Error(`${path}: does not export parse(text, info)`);
  return s;
}

// Channels grouped by name per experiment. The primary declaration is the first
// usable one (empty `disabled`); the channel's unit is the controller whose
// address is the primary's board.
export function channelTables(sources, boardOwner) {
  const tables = {};
  for (const [exp, src] of Object.entries(sources)) {
    const table = {};
    for (const ch of src.parsed.channels) (table[ch.name] ??= { name: ch.name, decls: [], usedBy: [] }).decls.push(ch);
    for (const e of Object.values(table)) {
      e.primary = e.decls.find(d => !d.disabled.length) ?? e.decls[0];
      e.unit = e.primary.board ? boardOwner[exp]?.get(normAddress(e.primary.board)) ?? null : null;
    }
    tables[exp] = table;
  }
  return tables;
}

const str = v => (v === null || v === undefined ? null : String(v));

// A script's channel with every field in its expected type, so a sloppy
// script can't break the graph or the generated files.
export function cleanChannel(ch) {
  const out = {
    name: String(ch.name),
    kind: str(ch.kind) ?? 'channel',
    address: str(ch.address) ? normAddress(ch.address) : null,
    board: str(ch.board) ? normAddress(ch.board) : null,
    comment: str(ch.comment) ?? '',
    disabled: (Array.isArray(ch.disabled) ? ch.disabled : ch.disabled ? [ch.disabled] : []).map(String),
    source: { label: str(ch.source?.label), url: str(ch.source?.url) },
    extra: {},
  };
  if (!out.address) out.unresolved = str(ch.unresolved);
  if (out.address && !out.board) out.board = out.address.split('/')[0];
  for (const [k, v] of Object.entries(ch.extra ?? {})) if (str(v)) out.extra[k] = String(v);
  return out;
}

export const EMPTY_PARSE = { channels: [], boards: [], appendix: '' };

export function cleanParse(p) {
  return {
    channels: (p?.channels ?? []).filter(ch => ch && str(ch.name)).map(cleanChannel),
    boards: (p?.boards ?? []).map(b => ({ name: String(b.name ?? ''), address: str(b.address) ? normAddress(b.address) : null, comment: str(b.comment) ?? '' })),
    appendix: str(p?.appendix) ?? '',
  };
}
