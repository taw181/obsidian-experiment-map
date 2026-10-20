// Lab book pages that link to a component, newest first. Daily notes start their
// filename with the date; pages without one sort last, by path.

export const LINK_TARGETS = /\[\[([^\]|#^]+)/g;

const dateOf = p => /(?:^|\/)(\d{4}-\d{2}-\d{2})[^/]*$/.exec(p)?.[1] ?? '';

export function sortMentions(paths) {
  return [...new Set(paths)].sort((a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    if (da !== db) return da < db ? 1 : -1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
