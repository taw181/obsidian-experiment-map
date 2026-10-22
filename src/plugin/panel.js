import { noteName } from '../core/notes.js';
import { asList } from '../core/wikilink.js';

const FIRST = ['type', 'experiment', 'location', 'status'];
const HIDDEN = new Set(['manuals', 'tags', 'aliases', 'cssclasses']);

function section(parent, title) {
  const s = parent.createDiv('em-panel-section');
  s.createDiv({ cls: 'em-section-title', text: title });
  return s;
}

function row(parent, key, fill) {
  const r = parent.createDiv('em-row');
  r.createSpan({ cls: 'em-key', text: key });
  const v = r.createSpan('em-value');
  if (typeof fill === 'function') fill(v);
  else v.setText(fill);
  return r;
}

function link(parent, text, onClick) {
  const a = parent.createEl('a', { text, cls: 'internal-link' });
  a.addEventListener('click', ev => {
    ev.preventDefault();
    onClick();
  });
  return a;
}

function manualLink(parent, entry) {
  const md = /^\[([^\]]+)\]\((.+)\)$/.exec(String(entry).trim());
  const url = md ? md[2] : String(entry).trim();
  let label = md ? md[1] : url;
  if (!md) {
    try {
      const u = new URL(url);
      label = `${u.hostname}${decodeURIComponent(u.pathname).split('/').filter(Boolean).slice(-1).map(s => ` › ${s}`).join('')}`;
    } catch {
      label = url;
    }
  }
  parent.createDiv().createEl('a', { text: label, href: url, cls: 'external-link' });
}

export function renderPanel(el, name, ctx) {
  el.empty();
  const c = ctx.graph.components[name];
  if (!c) {
    el.addClass('is-hidden');
    return;
  }
  el.removeClass('is-hidden');

  const head = el.createDiv('em-panel-head');
  head.createEl('h3', { text: c.name });
  const close = head.createEl('button', { text: '×', cls: 'em-panel-close', attr: { 'aria-label': 'Close' } });
  close.addEventListener('click', ctx.close);

  const problems = ctx.graph.problems.filter(p => p.subject === c.name);
  if (problems.length) {
    const box = el.createDiv('em-panel-problems');
    for (const p of problems) box.createDiv({ text: `⚠ ${p.message}` });
  }

  const props = el.createDiv('em-panel-section');
  if (c.model) row(props, 'model', v => link(v, c.model, () => ctx.openLink(c.model)));
  const keys = [...FIRST.filter(k => k in c.props), ...Object.keys(c.props).filter(k => !FIRST.includes(k) && !HIDDEN.has(k)).sort()];
  for (const k of keys) {
    const v = c.props[k];
    const text = Array.isArray(v) ? v.join(', ') || '—'
      : v && typeof v === 'object' ? Object.entries(v).map(([a, b]) => `${a}: ${b}`).join(', ') || '—'
        : String(v);
    const r = row(props, k.replace(/_/g, ' '), text);
    const origin = c.origin[k];
    if (origin && origin !== 'own') {
      r.addClass('em-inherited');
      r.createSpan({ cls: 'em-origin', text: origin.startsWith('model:') ? `from ${origin.slice(6)}` : `(${origin})` });
    }
  }

  const ins = section(el, 'Inputs');
  for (const b of c.inputs.beam) {
    row(ins, 'beam', v => {
      link(v, b.unit, () => ctx.select(b.unit));
      if (b.item) v.appendText(` › ${b.item}`);
    });
  }
  for (const r of c.inputs.rf) {
    row(ins, 'rf', v => {
      link(v, r.unit, () => ctx.select(r.unit));
      if (r.item) v.appendText(` › ${r.item}`);
    });
  }
  for (const x of c.inputs.control) {
    row(ins, 'control', v => {
      const page = x.experiment ? ctx.channelSources[x.experiment]?.page : null;
      if (x.unit) link(v, x.unit, () => ctx.select(x.unit));
      else if (!x.channel && page) link(v, page, () => ctx.openLink(page));
      else v.appendText('(no controller)');
      if (x.channel) {
        v.appendText(' › ');
        link(v, x.channel, () => ctx.openLink(`${page}#${x.channel}`));
        if (x.address) v.createSpan({ cls: 'em-muted', text: `  ${x.address}` });
      } else if (x.item) {
        v.appendText(` › ${x.item}`);
      }
    });
  }
  if (!c.inputs.beam.length && !c.inputs.rf.length && !c.inputs.control.length) ins.createDiv({ cls: 'em-muted', text: 'none' });

  if (c.feeds.length || c.drives.length) {
    const out = section(el, 'Feeds');
    for (const n of c.feeds) row(out, 'beam', v => link(v, n, () => ctx.select(n)));
    for (const n of c.drives) row(out, 'drives', v => link(v, n, () => ctx.select(n)));
  }

  const manuals = asList(c.props.manuals);
  if (manuals.length) {
    const m = section(el, 'Manuals');
    for (const entry of manuals) manualLink(m, entry);
  }

  const lb = section(el, 'Recent lab book');
  if (!ctx.mentions.length) lb.createDiv({ cls: 'em-muted', text: 'no pages link here yet' });
  for (const p of ctx.mentions.slice(0, 5)) link(lb.createDiv(), noteName(p), () => ctx.openLink(p));
  if (ctx.mentions.length > 5) link(lb.createDiv({ cls: 'em-muted' }), `+ ${ctx.mentions.length - 5} more in the note`, () => ctx.openLink(c.path));

  const open = el.createEl('button', { text: 'Open note', cls: 'mod-cta' });
  open.addEventListener('click', () => ctx.openLink(c.path));
}
