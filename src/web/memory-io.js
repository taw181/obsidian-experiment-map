// An io (see src/cli/node-io.js) over what `cli.js web-export` recorded: the
// web map reads the same files the plugin would, from the exported JSON.
export function memoryIo(exported) {
  return {
    async readText(p) {
      return exported.files[p] ?? null;
    },
    async listMarkdown(folder) {
      return (exported.listings[folder] ?? []).map(path => ({ path, text: exported.files[path] ?? '' }));
    },
    async writeText() {
      throw new Error('the web map is read-only');
    },
    async httpGetText() {
      throw new Error('offline');
    },
  };
}
