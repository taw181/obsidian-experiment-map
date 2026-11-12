import { clampDiameter } from '../core/layout.js';

// A drag handle on the selected round node (a circle). Dragging it resizes the
// circle about its centre; the new diameter is passed to `commit` on release.
// Plugin only: the read-only web map has no handles.
export class CircleResizer {
  // stage: the positioned element the canvas fills. grid(): the grid step (0: off); resizing snaps to a quarter of it.
  // commit(node, diameter): saves the new diameter.
  constructor({ canvas, stage, grid, commit }) {
    this.canvas = canvas;
    this.grid = grid;
    this.commit = commit;
    this.frame = null;
    this.drag = null;
    this.node = null;
    this.el = stage.createDiv('em-resize-handle is-hidden');
    this.el.setAttribute('aria-label', 'Drag to resize');
    this.el.addEventListener('pointerdown', e => this.start(e));
    this.el.addEventListener('pointermove', e => this.move(e));
    this.el.addEventListener('pointerup', e => this.end(e, true));
    this.el.addEventListener('pointercancel', e => this.end(e, false));
    this.onMoved = () => this.schedule();
    canvas.cy.on('viewport position', this.onMoved);
  }

  // The selection changed, or the map was redrawn.
  update() {
    const name = this.canvas.selected;
    const n = name ? this.canvas.cy.getElementById(name) : null;
    this.node = n && n.nonempty() && n.data('shape') === 'round' && !n.hasClass('hidden') ? n : null;
    this.place();
  }

  schedule() {
    if (this.frame == null) this.frame = requestAnimationFrame(() => { this.frame = null; this.place(); });
  }

  // On the circle's lower right, where it can't cover the label.
  place() {
    const n = this.node;
    if (!n || n.removed()) {
      this.el.addClass('is-hidden');
      return;
    }
    const cy = this.canvas.cy;
    const p = n.renderedPosition();
    const r = (n.data('d') / 2) * cy.zoom() * Math.SQRT1_2;
    this.el.style.left = `${p.x + r}px`;
    this.el.style.top = `${p.y + r}px`;
    this.el.removeClass('is-hidden');
  }

  start(e) {
    if (!this.node) return;
    e.preventDefault();
    e.stopPropagation();
    this.el.setPointerCapture(e.pointerId);
    this.drag = { before: this.node.data('d') };
  }

  move(e) {
    if (!this.drag) return;
    const cy = this.canvas.cy;
    const box = cy.container().getBoundingClientRect();
    const c = this.node.renderedPosition();
    const reach = Math.hypot(e.clientX - box.left - c.x, e.clientY - box.top - c.y);
    // The handle sits at radius 1 on the diagonal, so the pointer's distance
    // from the centre is the radius.
    const raw = (2 * reach) / cy.zoom();
    // Steps of a quarter of the grid (the grid is for placing boxes; a circle
    // needs finer control); Shift gives single units.
    const step = e.shiftKey ? 1 : Math.max(1, this.grid() / 4);
    this.set(clampDiameter(Math.round(raw / step) * step));
  }

  set(d) {
    this.node.data('d', d);
    this.place();
    this.canvas.routeLines();
  }

  end(e, keep) {
    if (!this.drag) return;
    const { before } = this.drag;
    this.drag = null;
    if (this.el.hasPointerCapture(e.pointerId)) this.el.releasePointerCapture(e.pointerId);
    if (!keep) this.set(before);
    else if (this.node.data('d') !== before) this.commit(this.node, this.node.data('d'));
  }

  destroy() {
    cancelAnimationFrame(this.frame);
    this.canvas.cy?.off('viewport position', this.onMoved);
    this.el.remove();
  }
}
