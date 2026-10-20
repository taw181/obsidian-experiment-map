// Wikilinks as they appear in frontmatter values: "[[Target#Heading|Alias]]".

const WIKILINK = /^\s*\[\[([^\]]+)\]\]\s*$/;

export function parseWikilink(value) {
  if (typeof value !== 'string') return null;
  const m = WIKILINK.exec(value);
  if (!m) return null;
  let inner = m[1].replace(/\\\|/g, '|');
  let alias = null;
  const bar = inner.indexOf('|');
  if (bar >= 0) {
    alias = inner.slice(bar + 1).trim() || null;
    inner = inner.slice(0, bar);
  }
  let heading = null;
  const hash = inner.indexOf('#');
  if (hash >= 0) {
    heading = inner.slice(hash + 1).trim() || null;
    inner = inner.slice(0, hash);
  }
  const target = inner.trim().split('/').pop().replace(/\.md$/i, '');
  return target ? { target, heading, alias } : null;
}

export function asList(value) {
  if (value === undefined || value === null || value === '') return [];
  return Array.isArray(value) ? value.filter(v => v !== null && v !== undefined && v !== '') : [value];
}

// YAML reads an unquoted [[x]] as a nested list ([["x"]]); turn it back into a link.
function unquotedLink(v) {
  while (Array.isArray(v) && v.length === 1 && Array.isArray(v[0])) v = v[0];
  return Array.isArray(v) && v.length === 1 && typeof v[0] === 'string' ? `[[${v[0]}]]` : null;
}

export function linkList(value) {
  return asList(value).flatMap(v => {
    if (Array.isArray(v)) {
      const link = unquotedLink(v);
      return link ? [link] : [];
    }
    return [String(v)];
  });
}
