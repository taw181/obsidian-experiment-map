// Lab book pages that link to a component, newest first. Daily notes start their
// filename with the date; pages without one sort last, by path.

export const LINK_TARGETS = /\[\[([^\]|#^]+)/g;
const WIKILINK = /!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g;

const dateOf = p => /(?:^|\/)(\d{4}-\d{2}-\d{2})[^/]*$/.exec(p)?.[1] ?? '';

export function sortMentions(paths) {
  return [...new Set(paths)].sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da !== db) return da < db ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

// The note name a link target points at: no folders, heading, block or `.md`.
export function linkName(target) {
  return target.split(/[#^]/)[0].trim().split('/').pop().replace(/\.md$/i, '');
}

// A line cut down for display: quote, heading, list and task markers go, and
// each [[link]] becomes its text. Returns [{text, hit}], `hit` marking the
// links for which isTarget(target) is true.
export function lineSegments(line, isTarget) {
  const text = line
    .replace(/^\s*(?:>\s*)*/, '')
    .replace(/^(?:#{1,6}\s+|(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?)/, '')
    .trimEnd();
  const out = [];
  const push = (t, hit) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last && last.hit === hit) last.text += t;
    else out.push({ text: t, hit });
  };
  let at = 0;
  for (const m of text.matchAll(WIKILINK)) {
    push(text.slice(at, m.index), false);
    push(m[2] ?? m[1].replace('#', ' > '), isTarget(m[1]));
    at = m.index + m[0].length;
  }
  push(text.slice(at), false);
  return out;
}

// The lines of a page that hold a [[link]] for which isTarget(target) is true,
// as [{line (from 0), segments}].
export function linkLines(text, isTarget) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.includes('[[')) return;
    const segments = lineSegments(line, isTarget);
    if (segments.some(s => s.hit)) out.push({ line: i, segments });
  });
  return out;
}
