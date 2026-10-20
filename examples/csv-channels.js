// Example channel source: control channels listed in a CSV file in the vault.
//
// Config.md:
//   channel_sources:
//     - experiment: main
//       script: Experiment map/.scripts/csv-channels.js
//       channel_page: Main channels
//       local: true
//       options: {file: Experiment map/channels.csv}
//
// channels.csv (header row first; quote a value that contains a comma):
//   name,kind,address,comment
//   coolingShutter,digital_out,Dev1/port0/line3,shutter driver input
//   coolingAOM,analog_out,Dev1/ao0,
//
// A channel's board is the part of its address before the first "/", so the
// controller note with `address: Dev1` (and the same experiment) drives it.
// `local: true` makes the plugin re-read the file on every sync and check.

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

module.exports = {
  async fetch(options, { readText }) {
    const text = await readText(options.file);
    if (text === null) throw new Error(`${options.file} not found`);
    return { text, version: null, url: null, label: options.file };
  },

  parse(text, { options }) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const header = splitCsvLine(lines.shift() ?? '').map(h => h.toLowerCase());
    const col = name => header.indexOf(name);
    const base = String(options.file).split('/').pop();
    const channels = lines.map((line, i) => {
      const cells = splitCsvLine(line);
      const get = name => (col(name) >= 0 ? cells[col(name)] ?? '' : '');
      const address = get('address') || null;
      return {
        name: get('name'),
        kind: get('kind') || 'channel',
        address,
        board: address ? address.split('/')[0] : null,
        unresolved: address ? undefined : 'no address in the CSV',
        comment: get('comment'),
        disabled: [],
        source: { label: `${base}:${i + 2}`, url: null },
      };
    }).filter(ch => ch.name);
    return { channels, boards: [], appendix: '' };
  },
};
