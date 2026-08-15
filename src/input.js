export const KEYMAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyJ: 'attack',
  Space: 'confirm',
  Enter: 'confirm',
  KeyR: 'restart',
  Escape: 'pause',
};

export const MOUSEMAP = {
  0: 'attack',
};

export class Input {
  constructor(target = window) {
    this.held = new Set();
    this.fresh = new Set();
    this.pointer = null;

    target.addEventListener('keydown', (e) => this.onKey(e, true));
    target.addEventListener('keyup', (e) => this.onKey(e, false));
    target.addEventListener('mousemove', (e) => this.onMove(e));
    target.addEventListener('mousedown', (e) => this.onMouse(e, true));
    target.addEventListener('mouseup', (e) => this.onMouse(e, false));
    target.addEventListener('blur', () => {
      this.held.clear();
      this.fresh.clear();
    });
  }

  onKey(e, down) {
    const action = KEYMAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.press(action, down);
  }

  onMove(e) {
    this.pointer = { x: e.clientX, y: e.clientY };
  }

  onMouse(e, down) {
    this.onMove(e);
    const action = MOUSEMAP[e.button];
    if (!action) return;
    e.preventDefault();
    this.press(action, down);
  }

  press(action, down) {
    if (down) {
      if (!this.held.has(action)) this.fresh.add(action);
      this.held.add(action);
    } else {
      this.held.delete(action);
    }
  }

  has(action) {
    return this.held.has(action);
  }

  consume(action) {
    return this.fresh.delete(action);
  }

  axis() {
    let x = (this.has('right') ? 1 : 0) - (this.has('left') ? 1 : 0);
    let y = (this.has('down') ? 1 : 0) - (this.has('up') ? 1 : 0);
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  endFrame() {
    this.fresh.clear();
  }
}
