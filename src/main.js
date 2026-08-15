import { Input } from './input.js';
import { Game } from './game.js';

const game = new Game(
  document.getElementById('game'),
  document.getElementById('hud'),
  new Input()
);

addEventListener('resize', () => game.resizeHud());

let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  game.update(dt);
  game.draw();
  game.input.endFrame();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
