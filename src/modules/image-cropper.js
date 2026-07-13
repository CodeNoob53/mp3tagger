/**
 * Interactive square crop editor state machine.
 * Renders onto a canvas; supports pointer drag, wheel zoom, pinch,
 * keyboard (arrows = pan, +/- = zoom, r = rotate), cover/contain fits.
 * Pure logic + canvas drawing; the dialog wiring lives in components/artwork-editor.js.
 */

export class Cropper {
  /**
   * @param {HTMLCanvasElement} canvas square stage canvas
   * @param {ImageBitmap} bitmap
   */
  constructor(canvas, bitmap) {
    this.canvas = canvas;
    this.bitmap = bitmap;
    this.stageSize = 480; // logical stage units; canvas is scaled to match
    const dpr = window.devicePixelRatio || 1;
    canvas.width = this.stageSize * dpr;
    canvas.height = this.stageSize * dpr;
    this.dpr = dpr;
    /** transform: image center position (stage coords), scale, rotation deg */
    this.t = { x: this.stageSize / 2, y: this.stageSize / 2, scale: 1, rotation: 0 };
    this.minScale = 0.05;
    this.maxScale = 20;
    this.onChange = null;
    this._pointers = new Map();
    this._pinchStart = null;
    this._bindEvents();
    this.fit('cover');
  }

  /** Scale so the image covers / fits inside the stage. @param {'cover'|'contain'} mode */
  fit(mode) {
    const rotated = Math.abs(this.t.rotation % 180) === 90;
    const w = rotated ? this.bitmap.height : this.bitmap.width;
    const h = rotated ? this.bitmap.width : this.bitmap.height;
    const sx = this.stageSize / w;
    const sy = this.stageSize / h;
    this.t.scale = mode === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    this.baseScale = this.t.scale;
    this.center();
  }

  center() {
    this.t.x = this.stageSize / 2;
    this.t.y = this.stageSize / 2;
    this.draw();
  }

  reset() {
    this.t.rotation = 0;
    this.fit('cover');
  }

  rotate90() {
    this.t.rotation = (this.t.rotation + 90) % 360;
    this.draw();
  }

  /** @param {number} factor multiplicative @param {{x:number,y:number}} [around] stage coords */
  zoom(factor, around) {
    const prev = this.t.scale;
    const next = Math.min(this.maxScale, Math.max(this.minScale, prev * factor));
    const k = next / prev;
    if (around) {
      this.t.x = around.x + (this.t.x - around.x) * k;
      this.t.y = around.y + (this.t.y - around.y) * k;
    }
    this.t.scale = next;
    this.draw();
  }

  /** Zoom mapped from a 0..100 slider (relative to fitted base scale). @param {number} v */
  setZoomSlider(v) {
    const factor = Math.pow(8, v / 100); // 1x..8x of base
    this.t.scale = (this.baseScale ?? 1) * factor;
    this.draw();
  }

  /** Current slider position 0..100 for the scale. */
  zoomSliderValue() {
    const rel = this.t.scale / (this.baseScale ?? 1);
    return Math.round(Math.min(100, Math.max(0, (Math.log(rel) / Math.log(8)) * 100)));
  }

  pan(dx, dy) {
    this.t.x += dx;
    this.t.y += dy;
    this.draw();
  }

  draw() {
    const ctx = this.canvas.getContext('2d');
    const s = this.stageSize * this.dpr;
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    ctx.scale(this.dpr, this.dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(this.t.x, this.t.y);
    ctx.rotate((this.t.rotation * Math.PI) / 180);
    ctx.scale(this.t.scale, this.t.scale);
    ctx.drawImage(this.bitmap, -this.bitmap.width / 2, -this.bitmap.height / 2);
    ctx.restore();
    this.onChange?.();
  }

  _stagePoint(ev) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * this.stageSize,
      y: ((ev.clientY - rect.top) / rect.height) * this.stageSize,
    };
  }

  _bindEvents() {
    const c = this.canvas;
    this._handlers = [];
    const add = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      this._handlers.push([target, type, fn]);
    };

    add(c, 'pointerdown', (ev) => {
      c.setPointerCapture(ev.pointerId);
      this._pointers.set(ev.pointerId, this._stagePoint(ev));
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.t.scale };
      }
    });
    add(c, 'pointermove', (ev) => {
      if (!this._pointers.has(ev.pointerId)) return;
      const prev = this._pointers.get(ev.pointerId);
      const now = this._stagePoint(ev);
      this._pointers.set(ev.pointerId, now);
      if (this._pointers.size === 1) {
        this.pan(now.x - prev.x, now.y - prev.y);
      } else if (this._pointers.size === 2 && this._pinchStart) {
        const [a, b] = [...this._pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const target = this._pinchStart.scale * (dist / this._pinchStart.dist);
        this.zoom(target / this.t.scale, mid);
      }
    });
    const lift = (ev) => {
      this._pointers.delete(ev.pointerId);
      if (this._pointers.size < 2) this._pinchStart = null;
    };
    add(c, 'pointerup', lift);
    add(c, 'pointercancel', lift);
    add(c, 'wheel', (ev) => {
      ev.preventDefault();
      this.zoom(ev.deltaY < 0 ? 1.08 : 1 / 1.08, this._stagePoint(ev));
    }, { passive: false });
    add(c, 'keydown', (ev) => {
      const step = ev.shiftKey ? 20 : 5;
      const map = {
        ArrowLeft: () => this.pan(-step, 0),
        ArrowRight: () => this.pan(step, 0),
        ArrowUp: () => this.pan(0, -step),
        ArrowDown: () => this.pan(0, step),
        '+': () => this.zoom(1.1),
        '=': () => this.zoom(1.1),
        '-': () => this.zoom(1 / 1.1),
        r: () => this.rotate90(),
        R: () => this.rotate90(),
      };
      const fn = map[ev.key];
      if (fn) { ev.preventDefault(); fn(); }
    });
  }

  destroy() {
    for (const [target, type, fn] of this._handlers ?? []) target.removeEventListener(type, fn);
    this._handlers = [];
    this._pointers.clear();
  }
}
