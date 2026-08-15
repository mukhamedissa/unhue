import { CONFIG, LEVELS, DOORS, WORLD_MAP } from './config.js';
import { Player } from './player.js';
import { Enemy } from './enemy.js';
import { Wall } from './wall.js';
import { isColliding } from './collision.js';

const TOTAL_COLORS = WORLD_MAP.nodes.length - 1;
const VIEW_W = CONFIG.W / CONFIG.ZOOM;
const VIEW_H = CONFIG.H / CONFIG.ZOOM;

const SAVE_KEY = 'unhue';
const NODE_IDS = new Set(WORLD_MAP.nodes.map((n) => n.id));
const LEVEL_NODE = {};
for (const n of WORLD_MAP.nodes) {
  if (n.level > 0) LEVEL_NODE[n.level] = n.id;
}

const PREVIEW_SIZE = 64;
const PREVIEW_FLOOR = '#1a1a2e';
const PREVIEW_TILES = {
  '#': '#444',
  E: '#e24',
  C: '#fd3',
  X: '#3f3',
  F: '#3f3',
};

export class Game {
  constructor(gameCanvas, hudCanvas, input) {
    const ctx = gameCanvas.getContext('2d');
    const hudCtx = hudCanvas.getContext('2d');
    if (!ctx || !hudCtx) throw new Error('no 2d context');

    this.ctx = ctx;
    this.canvas = gameCanvas;
    this.hudCanvas = hudCanvas;
    this.hudCtx = hudCtx;
    this.input = input;
    this.hudScale = 1;

    this.state = 'worldmap';
    this.colors = new Set();

    this.levelIndex = 0;
    this.walls = [];
    this.enemies = [];
    this.doors = [];
    this.exits = [];
    this.spawns = {};
    this.player = new Player(0, 0);
    this.levelW = CONFIG.W;
    this.levelH = CONFIG.H;
    this.camX = 0;
    this.camY = 0;

    this.loadProgress();
    this.resizeHud();
  }

  loadProgress() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      for (const id of JSON.parse(raw)) {
        if (NODE_IDS.has(id)) this.colors.add(id);
      }
    } catch {}
  }

  saveProgress() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify([...this.colors]));
    } catch {}
  }

  resizeHud() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.hudCanvas.getBoundingClientRect();
    const w = Math.max(CONFIG.W, Math.round(rect.width * dpr));
    if (this.hudCanvas.width !== w) {
      this.hudCanvas.width = w;
      this.hudCanvas.height = Math.round((w * CONFIG.H) / CONFIG.W);
    }
    this.hudScale = this.hudCanvas.width / CONFIG.W;
  }

  pointerWorld() {
    const p = this.input.pointer;
    if (!p) return null;
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const z = CONFIG.ZOOM;
    return {
      x: this.camX + ((p.x - rect.left) * (CONFIG.W / rect.width)) / z,
      y: this.camY + ((p.y - rect.top) * (CONFIG.H / rect.height)) / z,
    };
  }

  setupLevel(levelIndex = 0, spawnPoint = '') {
    const rows = LEVELS[levelIndex];
    const t = CONFIG.TILE;

    this.levelIndex = levelIndex;
    this.walls = [];
    this.enemies = [];
    this.doors = [];
    this.exits = [];
    this.spawns = {};
    this.levelW = rows[0].length * t;
    this.levelH = rows.length * t;

    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const px = x * t;
        const py = y * t;
        const c = rows[y][x];

        if (c === '#') {
          this.walls.push(new Wall(px, py, t, t));
        } else if (c === 'E') {
          this.enemies.push(new Enemy(px + 2, py + 2));
        } else if (DOORS[c]) {
          this.doors.push({ key: c, x: px, y: py, w: t, h: t, ...DOORS[c] });
        } else if (c === 'X') {
          this.spawns[c] = { x: px + 2, y: py + 2 };
          this.exits.push({ x: px, y: py, w: t, h: t });
        } else if (c === 'P' || c === 'H') {
          this.spawns[c] = { x: px + 2, y: py + 2 };
        }
      }
    }

    const spawn = this.spawns[spawnPoint] || this.spawns.P || this.spawns.H || { x: t, y: t };

    if (!this.player) this.player = new Player(spawn.x, spawn.y);
    else {
      this.player.x = spawn.x;
      this.player.y = spawn.y;
      this.player.attacking = 0;
      this.player.cooldown = 0;
      this.player.invuln = 0;
    }

    this.snapCamera();
  }

  restart() {
    this.state = 'worldmap';
    this.player = new Player(0, 0);
    this.walls = [];
    this.enemies = [];
    this.doors = [];
    this.exits = [];
  }

  confirmPressed() {
    const a = this.input.consume('attack');
    const b = this.input.consume('confirm');
    const c = this.input.consume('restart');
    return a || b || c;
  }

  update(dt) {
    if (this.state === 'worldmap') {
      if (this.input.consume('restart')) {
        this.colors.clear();
        this.saveProgress();
      } else if (this.confirmPressed()) {
        this.state = 'playing';
        this.setupLevel(0);
      }
      return;
    }

    if (this.state !== 'playing') {
      if (this.confirmPressed()) this.restart();
      return;
    }

    if (this.input.consume('restart')) {
      this.restart();
      return;
    }

    this.player.update(dt, this.input, this.walls, this.pointerWorld());

    for (const d of this.doors) {
      if (isColliding(this.player, d)) {
        this.setupLevel(d.toLevel, d.spawn);
        return;
      }
    }

    for (const x of this.exits) {
      if (isColliding(this.player, x)) {
        this.setupLevel(0, 'P');
        return;
      }
    }

    const hitBox = this.player.attackBox();
    for (const e of this.enemies) {
      e.update(dt, this.player, this.walls);

      if (hitBox && isColliding(hitBox, e)) e.damage(CONFIG.PLAYER.damage);
      if (e.alive && isColliding(this.player, e)) this.player.damage(CONFIG.ENEMY.touchDamage);
    }
    this.enemies = this.enemies.filter((e) => e.alive);

    if (!this.player.alive) {
      this.state = 'gameover';
      return;
    }

    const node = LEVEL_NODE[this.levelIndex];
    if (node && this.enemies.length === 0 && !this.colors.has(node)) {
      this.colors.add(node);
      this.saveProgress();
      if (this.colors.size >= TOTAL_COLORS) {
        this.state = 'win';
        return;
      }
    }

    this.moveCamera(dt);
  }

  cameraTarget() {
    const x = this.player.cx - VIEW_W / 2;
    const y = this.player.cy - VIEW_H / 2;
    return {
      x: Math.max(0, Math.min(x, this.levelW - VIEW_W)),
      y: Math.max(0, Math.min(y, this.levelH - VIEW_H)),
    };
  }

  snapCamera() {
    const t = this.cameraTarget();
    this.camX = t.x;
    this.camY = t.y;
  }

  moveCamera(dt) {
    const t = this.cameraTarget();
    const k = 1 - Math.exp(-CONFIG.CAMERA_LERP * dt);
    this.camX += (t.x - this.camX) * k;
    this.camY += (t.y - this.camY) * k;
  }

  draw() {
    if (this.state === 'worldmap') {
      this.drawWorldMap();
      return;
    }

    const ctx = this.ctx;
    ctx.fillStyle = CONFIG.COLORS.bg;
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);

    const z = CONFIG.ZOOM;
    ctx.save();
    ctx.setTransform(z, 0, 0, z, -Math.round(this.camX * z), -Math.round(this.camY * z));

    for (const w of this.walls) w.draw(ctx);

    for (const x of this.exits) {
      ctx.fillStyle = CONFIG.COLORS.exit;
      ctx.fillRect(x.x + 3, x.y + 3, x.w - 6, x.h - 6);
      ctx.strokeStyle = CONFIG.COLORS.hud;
      ctx.lineWidth = 1;
      ctx.strokeRect(x.x + 0.5, x.y + 0.5, x.w - 1, x.h - 1);
    }

    for (const d of this.doors) {
      ctx.fillStyle = CONFIG.COLORS.doors[d.key];
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.fillStyle = CONFIG.COLORS.bg;
      ctx.fillRect(d.x + 5, d.y + 5, d.w - 10, d.h - 10);
    }

    for (const e of this.enemies) e.draw(ctx);
    this.player.draw(ctx);
    ctx.restore();

    this.drawHud();
  }

  previewRect(levelIndex, x, y, maxSize) {
    const rows = LEVELS[levelIndex];
    const cols = rows[0].length;
    const tile = Math.min(maxSize / cols, maxSize / rows.length);
    const w = cols * tile;
    const h = rows.length * tile;
    return { x: x - w / 2, y: y - h / 2, w, h, tile, rows, cols };
  }

  drawMapPreview(ctx, levelIndex, x, y, maxSize) {
    const r = this.previewRect(levelIndex, x, y, maxSize);

    ctx.fillStyle = PREVIEW_FLOOR;
    ctx.fillRect(r.x, r.y, r.w, r.h);

    for (let row = 0; row < r.rows.length; row++) {
      for (let col = 0; col < r.cols; col++) {
        const color = PREVIEW_TILES[r.rows[row][col]];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(r.x + col * r.tile, r.y + row * r.tile, r.tile, r.tile);
      }
    }

    ctx.strokeStyle = CONFIG.COLORS.enemy;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);

    return r;
  }

  drawHiddenPreview(ctx, levelIndex, x, y, maxSize) {
    const r = this.previewRect(levelIndex, x, y, maxSize);

    ctx.fillStyle = '#20202c';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = CONFIG.COLORS.enemy;
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);

    ctx.fillStyle = CONFIG.COLORS.enemy;
    ctx.font = 'bold 18px monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y);
    ctx.textBaseline = 'alphabetic';

    return r;
  }

  drawWorldMap() {
    const ctx = this.hudCtx;
    const W = CONFIG.W;
    const H = CONFIG.H;
    const C = CONFIG.COLORS;

    ctx.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
    ctx.fillStyle = '#0b0b10';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = C.hud;
    ctx.font = 'bold 26px monospace';
    ctx.fillText('UNHUE', W / 2, 34);
    ctx.fillStyle = C.enemy;
    ctx.font = '9px monospace';
    ctx.fillText('bring the colour back', W / 2, 50);
    ctx.font = '8px monospace';
    ctx.fillText('WASD to move  ~  click to attack', W / 2, 63);

    const pos = {};
    for (const n of WORLD_MAP.nodes) {
      pos[n.id] = { x: 46 + n.x * (W - 92), y: 72 + n.y * (H - 130) };
    }

    ctx.strokeStyle = C.wall;
    ctx.lineWidth = 2;
    for (const [a, b] of WORLD_MAP.links) {
      ctx.beginPath();
      ctx.moveTo(pos[a].x, pos[a].y);
      ctx.lineTo(pos[b].x, pos[b].y);
      ctx.stroke();
    }

    for (const n of WORLD_MAP.nodes) {
      const p = pos[n.id];
      const done = this.colors.has(n.id);
      let labelY = p.y + 23;

      if (n.level === 0) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.fillStyle = C.enemy;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        const r = done
          ? this.drawMapPreview(ctx, n.level, p.x, p.y, PREVIEW_SIZE)
          : this.drawHiddenPreview(ctx, n.level, p.x, p.y, PREVIEW_SIZE);

        if (done) {
          ctx.strokeStyle = n.color;
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 12;
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x - 2.5, r.y - 2.5, r.w + 5, r.h + 5);
          ctx.shadowBlur = 0;
        }

        labelY = r.y + r.h + 12;
      }

      ctx.fillStyle = done ? C.hud : C.enemy;
      ctx.font = '8px monospace';
      ctx.fillText(n.label, p.x, labelY);
    }

    ctx.fillStyle = C.hud;
    ctx.font = '10px monospace';
    ctx.fillText('Press SPACE to begin', W / 2, H - 16);

    if (this.colors.size) {
      ctx.fillStyle = C.enemy;
      ctx.font = '8px monospace';
      ctx.fillText(`${this.colors.size}/${TOTAL_COLORS} restored    R to clear progress`, W / 2, H - 4);
    }
  }

  drawHud() {
    const ctx = this.hudCtx;
    const C = CONFIG.COLORS;

    ctx.setTransform(this.hudScale, 0, 0, this.hudScale, 0, 0);
    ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);

    for (let i = 0; i < this.player.maxHp; i++) {
      ctx.fillStyle = i < this.player.hp ? C.mane : C.enemy;
      ctx.fillRect(8 + i * 12, 8, 8, 8);
    }

    ctx.fillStyle = C.hud;
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    const line =
      this.levelIndex === 0
        ? `HUB  ${this.colors.size}/${TOTAL_COLORS}`
        : `LEVEL ${this.levelIndex}  LEFT ${this.enemies.length}`;
    ctx.fillText(line, CONFIG.W - 8, 16);

    if (this.state === 'playing') return;

    ctx.textAlign = 'center';
    ctx.fillStyle = this.state === 'win' ? C.horn : C.enemyAlert;
    ctx.font = 'bold 24px monospace';
    ctx.fillText(this.state === 'win' ? 'COLOUR RESTORED' : 'DRAINED', CONFIG.W / 2, CONFIG.H / 2);
    ctx.fillStyle = C.hud;
    ctx.font = '10px monospace';
    ctx.fillText('press SPACE to try again', CONFIG.W / 2, CONFIG.H / 2 + 20);
  }
}
