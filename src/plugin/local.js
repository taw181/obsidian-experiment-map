// Per-machine state (which map is showing, guide progress). Never in the vault:
// shared vaults commit the plugin folder, data.json included.
export function loadLocal(app, key) {
  if (app.loadLocalStorage) return app.loadLocalStorage(`experiment-map-${key}`) ?? null;
  try {
    const v = window.localStorage.getItem(`experiment-map:${app.appId}:${key}`);
    return v === null ? null : JSON.parse(v);
  } catch {
    return null;
  }
}

export function saveLocal(app, key, value) {
  if (app.saveLocalStorage) {
    app.saveLocalStorage(`experiment-map-${key}`, value);
    return;
  }
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(`experiment-map:${app.appId}:${key}`);
    else window.localStorage.setItem(`experiment-map:${app.appId}:${key}`, JSON.stringify(value));
  } catch {
    // storage blocked: the state lasts this session only
  }
}
