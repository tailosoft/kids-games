// One burst, then the canvas goes quiet. Honours prefers-reduced-motion by
// drawing the same colours as a still scatter instead of animating them.
const COLOURS = ['#FF7A3D', '#8BE34A', '#4CC9F0', '#E6447F', '#FFF6E9'];

export function burst(canvas, options) {
  const opts = options || {};
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.scale(dpr, dpr);

  const count = opts.count || 120;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pieces = [];
  for (let i = 0; i < count; i += 1) {
    const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 1.9;
    const speed = 5 + Math.random() * 8;
    pieces.push({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: still ? Math.random() * h : h * 0.62,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 8,
      spin: (Math.random() - 0.5) * 0.3,
      turn: Math.random() * Math.PI,
      colour: COLOURS[i % COLOURS.length],
    });
  }

  function paint() {
    ctx.clearRect(0, 0, w, h);
    for (const p of pieces) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.turn);
      ctx.fillStyle = p.colour;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
  }

  if (still) {
    paint();
    return () => ctx.clearRect(0, 0, w, h);
  }

  let frame = 0;
  let alive = true;
  function step() {
    if (!alive) return;
    frame += 1;
    for (const p of pieces) {
      p.vy += 0.26;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.turn += p.spin;
    }
    paint();
    if (frame < 200) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);

  return () => {
    alive = false;
    ctx.clearRect(0, 0, w, h);
  };
}
