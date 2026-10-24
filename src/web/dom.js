// The DOM helpers Obsidian adds to HTMLElement, for the code shared with the
// plugin (MapCanvas, panel.js). Only what that code uses, with Obsidian's
// meaning; a helper that already exists is left alone.

function apply(el, o) {
  if (typeof o === 'string') o = { cls: o };
  if (!o) return el;
  if (o.cls) el.addClass(...(Array.isArray(o.cls) ? o.cls : String(o.cls).split(' ')));
  if (o.text != null) el.setText(o.text);
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) if (v != null) el.setAttribute(k, v);
  for (const k of ['title', 'type', 'value', 'placeholder', 'href']) if (o[k] != null) el.setAttribute(k, o[k]);
  return el;
}

const helpers = {
  createEl(tag, o) {
    return apply(this.appendChild(document.createElement(tag)), o);
  },
  createDiv(o) {
    return this.createEl('div', o);
  },
  createSpan(o) {
    return this.createEl('span', o);
  },
  empty() {
    while (this.firstChild) this.removeChild(this.firstChild);
  },
  setText(text) {
    this.textContent = String(text);
  },
  appendText(text) {
    this.appendChild(document.createTextNode(String(text)));
  },
  addClass(...cls) {
    this.classList.add(...cls.filter(Boolean));
  },
  removeClass(...cls) {
    this.classList.remove(...cls.filter(Boolean));
  },
  toggleClass(cls, on) {
    for (const c of Array.isArray(cls) ? cls : [cls]) this.classList.toggle(c, on);
  },
};

export function installDomHelpers() {
  for (const [name, fn] of Object.entries(helpers)) {
    if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value: fn, configurable: true, writable: true });
  }
}
