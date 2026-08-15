export function isColliding(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function resolveWallCollision(box, dx, dy, walls) {
  let hitX = false;
  let hitY = false;

  box.x += dx;
  if (dx !== 0) {
    for (const w of walls) {
      if (!isColliding(box, w)) continue;
      box.x = dx > 0 ? w.x - box.w : w.x + w.w;
      hitX = true;
    }
  }

  box.y += dy;
  if (dy !== 0) {
    for (const w of walls) {
      if (!isColliding(box, w)) continue;
      box.y = dy > 0 ? w.y - box.h : w.y + w.h;
      hitY = true;
    }
  }

  return { hitX, hitY };
}

export function hasLineOfSight(x0, y0, x1, y1, walls, step = 6) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.ceil(Math.hypot(dx, dy) / step);
  if (steps === 0) return true;

  const probe = { x: 0, y: 0, w: 1, h: 1 };
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    probe.x = x0 + dx * t;
    probe.y = y0 + dy * t;
    for (const w of walls) {
      if (isColliding(probe, w)) return false;
    }
  }
  return true;
}
