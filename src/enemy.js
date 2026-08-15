import { CONFIG } from './config.js';
import { resolveWallCollision, hasLineOfSight } from './collision.js';

const E = CONFIG.ENEMY;

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

export class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.w = E.size;
    this.h = E.size;
    this.hp = E.hp;

    this.dirIndex = Math.floor(Math.random() * DIRS.length);
    this.pause = 0;
    this.chasing = false;
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

  update(dt, player, walls) {
    const dx = player.cx - this.cx;
    const dy = player.cy - this.cy;
    const dist = Math.hypot(dx, dy);

    this.chasing =
      player.alive &&
      dist < E.sight &&
      hasLineOfSight(this.cx, this.cy, player.cx, player.cy, walls);

    if (this.chasing) {
      const speed = (E.chaseSpeed * dt) / (dist || 1);
      resolveWallCollision(this, dx * speed, dy * speed, walls);
      return;
    }

    if (this.pause > 0) {
      this.pause -= dt;
      return;
    }

    const [vx, vy] = DIRS[this.dirIndex];
    const hit = resolveWallCollision(this, vx * E.patrolSpeed * dt, vy * E.patrolSpeed * dt, walls);
    if (hit.hitX || hit.hitY) {
      this.dirIndex = (this.dirIndex + 1 + Math.floor(Math.random() * 3)) % DIRS.length;
      this.pause = E.turnPause;
    }
  }

  damage(amount) {
    this.hp -= amount;
    return !this.alive;
  }

  draw(ctx) {
    const C = CONFIG.COLORS;
    ctx.fillStyle = this.chasing ? C.enemyAlert : C.enemy;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.fillStyle = C.bg;
    ctx.fillRect(this.x + 3, this.y + 4, 2, 2);
    ctx.fillRect(this.x + this.w - 5, this.y + 4, 2, 2);
  }
}
