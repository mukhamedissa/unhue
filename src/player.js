import { CONFIG } from './config.js';
import { resolveWallCollision } from './collision.js';

const P = CONFIG.PLAYER;

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = P.size;
    this.h = P.size;

    this.hp = P.hp;
    this.maxHp = P.hp;

    this.invuln = 0;
    this.cooldown = 0;
    this.attacking = 0;

    this.faceX = 1;
    this.faceY = 0;
  }

  get alive() {
    return this.hp > 0;
  }

  get cx() {
    return this.x + this.w / 2;
  }

  get cy() {
    return this.y + this.h / 2;
  }

  update(dt, input, walls, aim) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.attacking = Math.max(0, this.attacking - dt);

    const dir = input.axis();
    if (dir.x !== 0 || dir.y !== 0) {
      if (!aim) {
        this.faceX = dir.x;
        this.faceY = dir.y;
      }
      resolveWallCollision(this, dir.x * P.speed * dt, dir.y * P.speed * dt, walls);
    }

    if (aim) {
      const ax = aim.x - this.cx;
      const ay = aim.y - this.cy;
      const dist = Math.hypot(ax, ay);
      if (dist > 0.5) {
        this.faceX = ax / dist;
        this.faceY = ay / dist;
      }
    }

    if (input.consume('attack') && this.cooldown === 0) {
      this.cooldown = P.attackCooldown;
      this.attacking = P.attackDuration;
    }
  }

  attackBox() {
    if (this.attacking <= 0) return null;
    const r = P.attackRange;
    return {
      x: this.cx + this.faceX * r * 0.5 - r / 2,
      y: this.cy + this.faceY * r * 0.5 - r / 2,
      w: r,
      h: r,
    };
  }

  damage(amount) {
    if (this.invuln > 0 || !this.alive) return false;
    this.hp -= amount;
    this.invuln = P.invuln;
    return true;
  }

  draw(ctx) {
    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) return;

    const C = CONFIG.COLORS;
    ctx.fillStyle = C.player;
    ctx.fillRect(this.x, this.y, this.w, this.h);

    ctx.fillStyle = C.mane;
    ctx.fillRect(this.x, this.y, this.w, 3);

    ctx.fillStyle = C.horn;
    ctx.fillRect(this.cx + this.faceX * 7 - 1.5, this.cy + this.faceY * 7 - 1.5, 3, 3);

    const box = this.attackBox();
    if (box) {
      ctx.strokeStyle = C.horn;
      ctx.lineWidth = 1;
      ctx.strokeRect(box.x + 0.5, box.y + 0.5, box.w - 1, box.h - 1);
    }
  }
}
