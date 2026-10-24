// Wraps an io so that everything read through it is kept: the text of every
// readText() and every listMarkdown() folder's file list. web-export saves the
// record, and the web map (src/web/memory-io.js) replays it, so it reads exactly
// what the plugin and CLI read without knowing which files those are.
export function recordingIo(io) {
  const record = { files: {}, listings: {} };
  return {
    record,
    io: {
      ...io,
      async readText(p) {
        const text = await io.readText(p);
        record.files[p] = text;
        return text;
      },
      async listMarkdown(folder) {
        const files = await io.listMarkdown(folder);
        record.listings[folder] = files.map(f => f.path);
        for (const f of files) record.files[f.path] = f.text;
        return files;
      },
    },
  };
}
