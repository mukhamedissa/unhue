import { CONFIG } from './config.js';

export class Wall {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  draw(ctx) {
    ctx.fillStyle = CONFIG.COLORS.wall;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = CONFIG.COLORS.wallTop;
    ctx.fillRect(this.x, this.y, this.w, 2);
  }
}
