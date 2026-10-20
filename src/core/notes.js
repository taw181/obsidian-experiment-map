import { load, CORE_SCHEMA } from 'js-yaml';

const FRONTMATTER = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;
const H2 = /^##[ \t]+(.+?)[ \t]*$/gm;

export function noteName(path) {
  return path.split('/').pop().replace(/\.md$/i, '');
}

// The note's text after its frontmatter.
export function noteBody(text) {
  const m = FRONTMATTER.exec(text);
  return m ? text.slice(m[0].length) : text;
}

// Split a note into frontmatter and level-2 headings. Never throws: a broken
// note comes back with empty frontmatter and an error message.
export function parseNote(path, text) {
  const note = { name: noteName(path), path, frontmatter: {}, headings: [], error: null };
  let body = text;
  const m = FRONTMATTER.exec(text);
  if (m) {
    body = text.slice(m[0].length);
    try {
      const fm = m[1] ? load(m[1], { schema: CORE_SCHEMA }) : null;
      if (fm !== null && fm !== undefined) {
        if (typeof fm === 'object' && !Array.isArray(fm)) note.frontmatter = fm;
        else note.error = 'frontmatter is not a list of properties';
      }
    } catch (e) {
      note.error = `frontmatter is not valid YAML (${e.reason || e.message})`;
    }
  } else if (/^---\r?\n/.test(text)) {
    note.error = 'frontmatter has no closing ---';
  }
  note.headings = [...body.matchAll(H2)].map(h => h[1].replace(/[ \t]+#+$/, '').trim());
  return note;
}
